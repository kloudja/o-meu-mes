import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { connect, databasePath } from './storage.mjs';
import { allowTransition } from './transition.mjs';
import { validSession } from '../modules/identity/account';
import { rights } from '../modules/privacy/rights';
import { spaceExport } from '../modules/finance/infrastructure/space-export';
import { policy, settings } from '../modules/identity/policy.mjs';
import { IdentityError, verifiedUser } from '../modules/identity/account';
import { authorizeSpace } from '../modules/spaces/access';
import { createSpace, SpaceCreationConflict } from '../modules/spaces/schema.mjs';
import { DomainError, validId, validPeriod } from '../modules/finance/domain/validation';
import { parseCommand } from '../modules/finance/contracts/command-schema';
import { applyCommand, readMonth, historyDetails } from '../modules/finance/infrastructure/repository';
import { inbox, updateRequest } from '../modules/finance/infrastructure/requests';
import { DuplicateError } from '../modules/finance/infrastructure/duplicates';
import { changeSharing, readSharing, sharingInput } from '../modules/spaces/sharing';

const spaceInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
  requestId: z.string().min(1).max(120),
});
const operationInput = z.strictObject({
  operation: z.enum(['prepare', 'resolve', 'ack']),
  requestId: z.string(),
  period: z.string(),
});
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, X-Account' },
  });
async function body(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
    throw new IdentityError('Formato de pedido inválido.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new IdentityError('Pedido inválido.', 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 32000) {
      await reader.cancel();
      throw new IdentityError('Pedido demasiado extenso.', 413);
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new IdentityError('Pedido inválido.', 422);
  }
}
export async function spaceRoute(
  request: NextRequest,
  route: 'spaces' | 'state' | 'requests' | 'history' | 'sharing' | 'privacy' | 'closure' | 'export',
) {
  const write = request.method === 'POST';
  try {
    const config = settings();
    if (
      request.headers.get('host') !== new URL(config.origin).host ||
      (write && request.headers.get('origin') !== config.origin)
    )
      throw new IdentityError('Origem inválida.', 403);
    const spaceId = request.nextUrl.searchParams.get('spaceId');
    if (!['spaces', 'privacy', 'closure'].includes(route) && !(route === 'sharing' && write) && !spaceId)
      throw new IdentityError('Escolha um espaço.', 403);
    if (process.env.OMEUMES_RECOVERY_SCOPE)
      throw new IdentityError('Acesso bloqueado na cópia recuperada.', 503);
    const input = write ? await body(request) : undefined;
    const path = databasePath();
    allowTransition(path);
    const db = connect(path, 5000);
    try {
      db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
      const cookie = request.cookies.get(config.secure ? '__Host-omeumes' : 'omeumes-session')?.value ?? '';
      const userId = verifiedUser(
        db,
        cookie,
        request.headers.get('x-account'),
        route === 'privacy' || route === 'closure',
      );
      if (route === 'closure') {
        const now = Date.now();
        const spaces = db
          .prepare(
            'SELECT id,name,delete_due FROM spaces WHERE owner_id=? AND IsDeleted=0 AND (delete_due IS NULL OR delete_due>?)',
          )
          .all(userId, now)
          .map((space) => ({
            ...space,
            members: db
              .prepare(
                "SELECT u.id,u.first_name||' '||u.last_name AS name FROM memberships m JOIN users u ON u.id=m.user_id WHERE space_id=? AND m.IsDeleted=0 AND role!='owner' AND u.lifecycle='Active'",
              )
              .all(space.id),
            proposal: db
              .prepare(
                'SELECT status,expires FROM ownership_transfers WHERE space_id=? ORDER BY rowid DESC LIMIT 1',
              )
              .get(space.id),
          }));
        db.exec('COMMIT');
        return json({ spaces });
      }
      let result;
      if (route === 'privacy') {
        const s = validSession(db, cookie, Date.now());
        const operator =
          userId === process.env.OMEUMES_RIGHTS_HANDLER &&
          !!s &&
          s.authenticated + policy.recent > Date.now() &&
          !!db
            .prepare(
              "SELECT 1 FROM credentials JOIN users ON users.id=credentials.user_id WHERE user_id=? AND totp IS NOT NULL AND lifecycle='Active'",
            )
            .get(userId);
        result = rights(db, userId, operator, input, Date.now(), config.key);
      } else if (route === 'export') result = spaceExport(db, spaceId!, userId, input, Date.now());
      else if (route === 'spaces') {
        if (write) {
          const parsed = spaceInput.safeParse(input);
          if (!parsed.success) throw new IdentityError('Indica um nome entre 1 e 80 caracteres.', 422);
          validId(parsed.data.requestId);
          result = { space: createSpace(db, userId, parsed.data.name, parsed.data.requestId) };
        } else {
          result = {
            spaces: db
              .prepare(`SELECT s.id,s.name,s.currency,m.role,s.delete_due,
                EXISTS(SELECT 1 FROM memberships other WHERE other.space_id=s.id AND other.user_id!=m.user_id
                  AND other.IsDeleted=0) AS shared
                FROM memberships m JOIN spaces s ON s.id=m.space_id
            WHERE m.user_id=? AND s.IsDeleted=0 AND m.IsDeleted=0 AND (s.delete_due IS NULL OR s.delete_due>?) ORDER BY s.rowid`)
              .all(userId, Date.now()),
          };
        }
      } else if (route === 'sharing') {
        if (write) {
          const parsed = sharingInput.safeParse(input);
          if (!parsed.success) {
            const field = String(parsed.error.issues[0]?.path[0] ?? '');
            throw new IdentityError(
              field === 'code'
                ? 'Revê o código do convite.'
                : field === 'email'
                  ? 'Indica um endereço de email válido.'
                  : 'Revê os dados do pedido.',
              422,
              field,
            );
          }
          result = changeSharing(db, config, spaceId, userId, parsed.data, Date.now());
        } else result = readSharing(db, config, spaceId!, userId, Date.now());
      } else {
        const ctx = authorizeSpace(
          db,
          userId,
          spaceId!,
          route === 'requests' ? 'receipt' : write ? 'write' : 'read',
        );
        if (route === 'history') {
          const period = request.nextUrl.searchParams.get('period') ?? '';
          validPeriod(period);
          const ids = request.nextUrl.searchParams.getAll('eventId');
          if (!ids.length || ids.length > 20 || ids.some((id) => id.length > 2000))
            throw new IdentityError('Página de histórico inválida.', 422);
          for (const id of ids) validId(id);
          result = historyDetails(db, ctx, period, ids);
        } else if (route === 'requests') {
          if (write) {
            const parsed = operationInput.safeParse(input);
            if (!parsed.success) throw new IdentityError('Referência de confirmação inválida.', 422);
            const { operation, requestId, period } = parsed.data;
            result = updateRequest(db, ctx, operation, requestId, period);
          } else
            result = inbox(
              db,
              ctx,
              request.nextUrl.searchParams.get('requestId') ?? undefined,
              request.nextUrl.searchParams.get('period') ?? undefined,
            );
        } else if (write) result = applyCommand(db, ctx, parseCommand(input), config.key);
        else {
          const period = request.nextUrl.searchParams.get('period') ?? undefined;
          if (period) validPeriod(period);
          result = readMonth(db, ctx, period);
        }
      }
      db.exec('COMMIT');
      return json(result);
    } finally {
      db.close();
    }
  } catch (e) {
    if (e instanceof DuplicateError)
      return json({ code: e.code, message: e.message, duplicate: e.notice }, 409);
    if (e instanceof SpaceCreationConflict) return json({ code: 'IDEMPOTENCY', message: e.message }, 409);
    if (e instanceof IdentityError)
      return json(
        { code: e.code, message: e.message, fields: e.field ? { [e.field]: e.message } : undefined },
        e.status,
      );
    if (e instanceof DomainError)
      return json({ code: e.code, message: e.message }, e.code === 'CONFLICT' ? 409 : 422);
    return json(
      { code: 'STORAGE', message: 'O pedido não pôde ser confirmado. Consulta o estado antes de repetir.' },
      503,
    );
  }
}
