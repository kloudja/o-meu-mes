import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { digest, opaque } from '../../identity/secrets.mjs';
import { IdentityError } from '../../identity/error';
import { authorizeSpace, spaceRole } from '../../spaces/access';
import { financialExport } from '../contracts/export';
import { load } from './state-tables';

const command = z.union([
  z.strictObject({ action: z.literal('prepare') }),
  z.strictObject({ action: z.literal('download'), token: z.string().length(43) }),
]);
export function spaceExport(db: DatabaseSync, space: string, user: string, input: unknown, now: number) {
  if (spaceRole(db, user, space, now) !== 'owner')
    throw new IdentityError('Só o proprietário pode exportar.', 403);
  const data = command.safeParse(input);
  if (!data.success) throw new IdentityError('Pedido de exportação inválido.', 422);
  if (data.data.action === 'prepare') {
    const token = opaque();
    db.prepare('DELETE FROM export_grants WHERE owner=? AND space_id=?').run(user, space);
    db.prepare('INSERT INTO export_grants VALUES(?,?,?,?)').run(digest(token), space, user, now + 60000);
    return { token };
  }
  if (
    !db
      .prepare('DELETE FROM export_grants WHERE digest=? AND space_id=? AND owner=? AND expires>?')
      .run(digest(data.data.token), space, user, now).changes
  )
    throw new IdentityError('Autorização de exportação expirada ou utilizada.', 403);
  const ctx = authorizeSpace(db, user, space, 'read');
  const periods = db
    .prepare('SELECT period FROM months WHERE space_id=? AND IsDeleted=0 ORDER BY period')
    .all(space)
    .map((row) => String(row.period));
  const state = load(db, ctx, '');
  for (const period of periods) Object.assign(state.months, load(db, ctx, period).months);
  const revision = Number(db.prepare('SELECT revision FROM meta WHERE space_id=?').get(space)?.revision);
  return financialExport({ state, revision, periods }, new Date(now).toISOString());
}
