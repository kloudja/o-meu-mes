import { randomUUID, createHmac } from 'node:crypto';
import { financialTables } from '../spaces/schema.mjs';
import { policy } from '../identity/policy.mjs';

export function retention(env = process.env) {
  function days(key, maximum) {
    const n = Number(env['OMEUMES_RETENTION_' + key] ?? maximum);
    if (!Number.isInteger(n) || n < 1 || n > maximum) throw new Error('Prazo de conservação inválido.');
    return n * policy.day;
  }
  return {
    operations: days('OPERATIONS', 30),
    audit: days('AUDIT', 90),
    backups: days('BACKUPS', 30),
    unverified: days('UNVERIFIED', 30),
  };
}
export function notifyMembers(db, space, message, now) {
  db.prepare(
    'INSERT INTO privacy_notices SELECT user_id,?,? FROM memberships WHERE space_id=? AND IsDeleted=0',
  ).run(now, message, space);
}
export function purgeSpace(db, space, now) {
  if (!db.isTransaction) throw new Error('Transação necessária.');
  notifyMembers(db, space, 'A eliminação de um dos teus espaços foi efetivada.', now);
  db.prepare("INSERT INTO privacy_gate VALUES(?,'purge')").run(space);
  for (const table of [
    'export_grants',
    'privacy_filters',
    'ownership_transfers',
    'space_invites',
    'legacy_assignment',
    'space_creations',
    'finance_versions',
    'receipts',
    'legacy_receipts',
    ...financialTables.toReversed(),
    'meta',
    'memberships',
  ]) {
    db.prepare('DELETE FROM ' + table + ' WHERE space_id=?').run(space);
  }
  db.prepare('DELETE FROM spaces WHERE id=?').run(space);
  db.prepare('DELETE FROM privacy_gate WHERE space_id=?').run(space);
}
export function finishClosure(db, id, now, key) {
  const user = db.prepare("SELECT email FROM users WHERE id=? AND lifecycle='PendingClosure'").get(id);
  if (!user || db.prepare('SELECT 1 FROM spaces WHERE owner_id=?').get(id)) return false;
  const at = new Date(now).toISOString();
  db.prepare(
    'UPDATE memberships SET IsDeleted=1,DeletedAt=?,ModifiedAt=? WHERE user_id=? AND IsDeleted=0',
  ).run(at, at, id);
  for (const row of db.prepare("SELECT DISTINCT space_id FROM space_invites WHERE status='pending'").all()) {
    const recipient = createHmac('sha256', key)
      .update('invite:' + row.space_id + ':' + user.email)
      .digest('hex');
    db.prepare(
      "UPDATE space_invites SET status='revoked',address=NULL,closed=? WHERE recipient=? AND status='pending'",
    ).run(now, recipient);
  }
  for (const table of [
    'mail_jobs',
    'challenges',
    'sessions',
    'recovery_codes',
    'registration_intents',
    'acceptances',
    'credentials',
    'privacy_notices',
  ])
    db.prepare('DELETE FROM ' + table + ' WHERE user_id=?').run(id);
  db.prepare(
    "UPDATE users SET verified=0,first_name='Utilizador',last_name='eliminado',email=?,pending_email=NULL,adult_at=0,created=0,lifecycle='Deleted' WHERE id=?",
  ).run('deleted:' + randomUUID(), id);
  return true;
}
export function cleanPrivacy(db, now, key) {
  const rules = retention();
  for (const { id } of db
    .prepare('SELECT id FROM spaces WHERE delete_due<=? ORDER BY delete_due LIMIT 16')
    .all(now))
    purgeSpace(db, id, now);
  for (const { id } of db
    .prepare(
      "SELECT id FROM users WHERE lifecycle='PendingClosure' AND NOT EXISTS(SELECT 1 FROM spaces WHERE owner_id=users.id) LIMIT 64",
    )
    .all())
    finishClosure(db, id, now, key);
  const prune = (table, where, ...args) =>
    db
      .prepare(
        'DELETE FROM ' +
          table +
          ' WHERE rowid IN(SELECT rowid FROM ' +
          table +
          ' WHERE ' +
          where +
          ' LIMIT 200)',
      )
      .run(...args);
  db.prepare(`UPDATE legacy_receipts SET canonical=json_object('period',CASE WHEN scope='open' THEN json_extract(canonical,'$.period') ELSE scope END,'retired',1)
    WHERE rowid IN(SELECT rowid FROM legacy_receipts WHERE AddedAt<=? AND json_extract(canonical,'$.retired') IS NULL LIMIT 200)`).run(
    new Date(now - rules.operations).toISOString(),
  );
  db.prepare(
    "UPDATE receipts SET fingerprint=NULL,result_id=NULL WHERE rowid IN(SELECT rowid FROM receipts WHERE status='confirmed' AND fingerprint IS NOT NULL AND AddedAt<=? LIMIT 200)",
  ).run(new Date(now - rules.operations).toISOString());
  prune('ownership_transfers', 'closed<=?', now - rules.operations);
  prune(
    'privacy_cases',
    'closed IS NOT NULL AND closed<=? AND coalesce(retain_until,0)<=?',
    now - rules.operations,
    now,
  );
  prune('privacy_audit', 'at<=?', now - rules.audit);
  prune('privacy_notices', 'at<=?', now - rules.operations);
  prune('export_grants', 'expires<=?', now);
  prune('privacy_filters', 'created<=?', now - policy.backupRetention);
  prune(
    'users',
    "lifecycle='Deleted' AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=users.id) AND NOT EXISTS(SELECT 1 FROM space_creations WHERE creator_id=users.id) AND NOT EXISTS(SELECT 1 FROM privacy_cases WHERE subject=users.id OR handler=users.id)",
  );
  db.prepare('UPDATE privacy_control SET last_cleanup=?').run(now);
}
