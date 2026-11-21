import type { DatabaseSync } from 'node:sqlite';
import { IdentityError } from '../identity/error';
export type SpaceCapability = 'read' | 'write' | 'receipt';
export type SpaceRole = 'owner' | 'editor' | 'reader';
const authorized: unique symbol = Symbol('authorized-space');
export interface SpaceContext {
  readonly spaceId: string;
  readonly userId: string;
  readonly [authorized]: SpaceCapability;
}
export function spaceRole(db: DatabaseSync, userId: string, spaceId: string, now = Date.now()): SpaceRole {
  const row =
    db.isTransaction &&
    db
      .prepare(`SELECT m.role FROM spaces s JOIN memberships m ON m.space_id=s.id
    WHERE s.id=? AND m.user_id=? AND s.IsDeleted=0 AND m.IsDeleted=0 AND (s.delete_due IS NULL OR s.delete_due>?)`)
      .get(spaceId, userId, now);
  if (!row) throw new IdentityError('Espaço indisponível.', 403, undefined, 'SPACE_ACCESS');
  return row.role as SpaceRole;
}
export function authorizeSpace(
  db: DatabaseSync,
  userId: string,
  spaceId: string,
  capability: SpaceCapability,
): SpaceContext {
  if (spaceRole(db, userId, spaceId) === 'reader' && capability !== 'read')
    throw new IdentityError('Neste espaço, a tua permissão é de leitura.', 403, undefined, 'READ_ONLY');
  if (
    capability !== 'read' &&
    db.prepare('SELECT 1 FROM spaces WHERE id=? AND delete_due IS NOT NULL').get(spaceId)
  )
    throw new IdentityError('Espaço em eliminação. Apenas leitura.', 403, undefined, 'READ_ONLY');
  return { spaceId, userId, [authorized]: capability };
}
export function requireWrite(ctx: SpaceContext) {
  if (ctx[authorized] !== 'write') throw new IdentityError('Ação indisponível.', 403);
}
