import { NextRequest, NextResponse } from 'next/server';
import { connect, databasePath } from '@/server/storage.mjs';
import { allowTransition } from '@/server/transition.mjs';
import { executeIdentity, readIdentity, IdentityError } from '@/modules/identity/account';
import { fieldErrors, identityInput } from '@/modules/identity/input';
import { settings } from '@/modules/identity/policy.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}
async function readBody(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
    throw new IdentityError('É necessário enviar JSON.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new IdentityError('Pedido vazio.');
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new IdentityError('Pedido demasiado extenso.', 413);
    }
    parts.push(next.value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  } catch {
    throw new IdentityError('Pedido inválido.');
  }
}
async function handle(request: NextRequest, write: boolean) {
  try {
    const config = settings();
    const origin = new URL(config.origin);
    if (
      request.headers.get('host') !== origin.host ||
      (write && request.headers.get('origin') !== config.origin)
    )
      return json({ message: 'Origem inválida.' }, 403);
    if (process.env.OMEUMES_RECOVERY_SCOPE)
      return json({ message: 'A identidade está bloqueada na cópia recuperada.' }, 503);
    const input = write ? identityInput.safeParse(await readBody(request)) : undefined;
    if (input && !input.success)
      return json({ message: 'Revê os campos indicados.', fields: fieldErrors(input.error) }, 422);
    const path = databasePath();
    allowTransition(path);
    const db = connect(path);
    try {
      const name = config.secure ? '__Host-omeumes' : 'omeumes-session';
      const cookie = request.cookies.get(name)?.value ?? '';
      if (input?.success) {
        const {
          cookie: next,
          maxAge,
          ...feedback
        } = executeIdentity(db, config, input.data, cookie, undefined, request.headers.get('x-account'));
        const response = json(feedback);
        if (next !== undefined)
          response.cookies.set(name, next, {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.secure,
            path: '/',
            maxAge,
          });
        return response;
      }
      db.exec('BEGIN');
      const view = readIdentity(db, cookie, Date.now());
      db.exec('COMMIT');
      return json(view);
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof IdentityError)
      return json(
        { message: error.message, fields: error.field ? { [error.field]: error.message } : undefined },
        error.status,
      );
    return json({ message: 'O serviço de identidade está temporariamente indisponível.' }, 503);
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
