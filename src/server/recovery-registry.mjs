import { createHmac, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, openSync, closeSync, realpathSync, lstatSync } from 'node:fs';
import { isAbsolute, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { seal, unseal } from '../modules/identity/secrets.mjs';
import { fences } from '../modules/privacy/schema.mjs';
import { finishClosure, purgeSpace, retention } from '../modules/privacy/lifecycle.mjs';
import { redact } from '../modules/privacy/redaction.mjs';

const refusal = () => new Error('Reconciliação indisponível. Conservar a quarentena.');
function authority(path, create = false) {
  const target = process.env.OMEUMES_RECOVERY_REGISTRY;
  const key = Buffer.from(process.env.OMEUMES_RECOVERY_KEY || '', 'base64');
  if (
    !target ||
    !isAbsolute(target) ||
    key.length !== 32 ||
    resolve(target) === resolve(path) ||
    dirname(resolve(target)) === dirname(resolve(path)) ||
    /(^|[\\/])(public|backups)([\\/]|$)/i.test(target)
  )
    throw refusal();
  if (create) {
    const fd = openSync(target, 'wx', 0o600);
    closeSync(fd);
    chmodSync(target, 0o600);
  }
  if (!existsSync(target) || lstatSync(target).nlink !== 1 || realpathSync(target) !== resolve(target))
    throw refusal();
  const registry = new DatabaseSync(target, { timeout: 5000 });
  registry.exec('PRAGMA synchronous=FULL; PRAGMA secure_delete=ON');
  return { registry, key };
}
const mac = (key, data) => createHmac('sha256', key).update(JSON.stringify(data)).digest('hex');
function identitySignature(db, key, id) {
  const row = db
    .prepare(
      'SELECT u.first_name,u.last_name,u.email,u.verified,c.password_hash,c.totp,c.last_step FROM users u LEFT JOIN credentials c ON u.id=c.user_id WHERE u.id=?',
    )
    .get(id);
  if (!row) return null;
  const { last_step, ...security } = row;
  return { hash: mac(key, security), step: last_step };
}
function capture(db, key, path, authTag = mac(key, process.env.OMEUMES_AUTH_KEY)) {
  const all = (sql) => db.prepare(sql).all();
  return {
    authTag,
    lineage: db.prepare('SELECT lineage FROM privacy_control').get().lineage,
    path: realpathSync(path),
    users: all("SELECT id,lifecycle FROM users WHERE lifecycle!='Deleted' AND verified=1").map((u) => ({
      ...u,
      ...identitySignature(db, key, u.id),
    })),
    spaces: all('SELECT id,owner_id,delete_due FROM spaces WHERE IsDeleted=0'),
    members: all('SELECT space_id,user_id,role FROM memberships WHERE IsDeleted=0'),
    filters: all('SELECT space_id,digest,created FROM privacy_filters'),
    receipts: all("SELECT space_id,user_id,request_id,period FROM receipts WHERE status!='pending'"),
    cases: all('SELECT * FROM privacy_cases').map((c) => ({
      id: c.id,
      packet: seal(
        key,
        'case:' + c.id,
        JSON.stringify([
          c,
          db.prepare('SELECT * FROM privacy_messages WHERE case_id=? ORDER BY rowid').all(c.id),
        ]),
      ),
    })),
  };
}
function save(registry, key, state) {
  const data = JSON.stringify(state);
  registry.prepare('INSERT OR REPLACE INTO authority VALUES(1,?,?,0)').run(data, mac(key, [data, 0]));
}
function read(registry, key) {
  const r = registry.prepare('SELECT data,signature,dirty FROM authority WHERE id=1').get();
  if (!r || !timingSafeEqual(Buffer.from(r.signature), Buffer.from(mac(key, [r.data, r.dirty]))))
    throw refusal();
  return { state: JSON.parse(r.data), dirty: r.dirty, data: r.data };
}
function backupProof(db, key) {
  const h = createHmac('sha256', key);
  const control = db.prepare('SELECT lineage,backup_at FROM privacy_control').get();
  h.update(JSON.stringify(control));
  for (const { name } of db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN('identity_control','privacy_control') ORDER BY name",
    )
    .all()) {
    if (!/^[a-z_]+$/.test(name)) throw refusal();
    h.update(JSON.stringify(name));
    for (const row of db.prepare('SELECT * FROM ' + name + ' ORDER BY rowid').iterate())
      h.update(JSON.stringify(row) + '\n');
  }
  return h.digest('hex');
}
export function stampBackup(copy, source, time) {
  if (copy.prepare('SELECT restored FROM identity_control').get().restored !== 0) throw refusal();
  copy.prepare('UPDATE privacy_control SET released=0,backup_at=?,backup_tag=NULL').run(time);
  if (!copy.prepare('SELECT registered FROM privacy_control').get().registered) return;
  const { registry, key } = authority(source);
  try {
    const current = read(registry, key).state;
    if (
      current.path !== realpathSync(source) ||
      current.lineage !== copy.prepare('SELECT lineage FROM privacy_control').get().lineage
    )
      throw refusal();
    copy.prepare('UPDATE privacy_control SET backup_tag=?').run(backupProof(copy, key));
  } finally {
    registry.close();
  }
}
export function provisionRegistry(db, path) {
  if (
    db.isTransaction ||
    db.prepare('SELECT registered FROM privacy_control').get().registered ||
    db.prepare('SELECT restored FROM identity_control').get().restored
  )
    throw refusal();
  db.exec('BEGIN IMMEDIATE');
  try {
    const { registry, key } = authority(path, true);
    try {
      registry.exec(
        'CREATE TABLE authority(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,signature TEXT NOT NULL,dirty INTEGER NOT NULL) STRICT',
      );
      save(registry, key, capture(db, key, path));
      db.exec('UPDATE privacy_control SET registered=1; COMMIT');
    } finally {
      registry.close();
    }
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
  }
  guardRegistry(db, path);
}
// The independently committed dirty bit is written BEFORE any sensitive row changes.
// A crash can make recovery unavailable, never certify a stale security checkpoint.
export function guardRegistry(db, path) {
  if (
    !db.prepare('SELECT registered FROM privacy_control').get().registered ||
    db.prepare('SELECT restored FROM identity_control').get().restored
  )
    return;
  const { registry, key } = authority(path);

  try {
    if (read(registry, key).state.path !== realpathSync(path)) throw refusal();
    db.function('recovery_fence', () => {
      registry.exec('BEGIN IMMEDIATE');
      try {
        const current = read(registry, key);
        if (current.state.path !== realpathSync(path)) throw refusal();
        if (!current.dirty)
          registry
            .prepare('UPDATE authority SET dirty=1,signature=? WHERE id=1')
            .run(mac(key, [current.data, 1]));
        registry.exec('COMMIT');
      } finally {
        if (registry.isTransaction) registry.exec('ROLLBACK');
      }
      return 1;
    });
    db.exec(fences);
  } catch (error) {
    registry.close();
    throw error;
  }
  const close = db.close.bind(db);
  db.close = () => {
    try {
      if (db.isTransaction) db.exec('ROLLBACK');
      db.exec('BEGIN IMMEDIATE');
      const current = read(registry, key);
      if (current.state.path !== realpathSync(path)) throw refusal();
      if (current.dirty || current.state.handoff)
        save(registry, key, capture(db, key, path, current.state.authTag));
      db.exec('COMMIT');
    } finally {
      registry.close();
      close();
    }
  };
}
function financialProof(db, space, key) {
  // Keep cents, unknown initials and event identities intact across privacy repairs.
  const result = ['initials', 'effects', 'allocations', 'observations'].map((table) =>
    db.prepare('SELECT * FROM ' + table + ' WHERE space_id=? ORDER BY rowid').all(space),
  );
  result.push(
    db
      .prepare(
        'SELECT period,id,amount,purchase_amount,corrects,replaced_by,reverses FROM events WHERE space_id=? ORDER BY rowid',
      )
      .all(space),
  );
  return mac(key, result);
}
export function reconcile(db, path, authKey, now = Date.now()) {
  const control = db.prepare('SELECT * FROM privacy_control').get();
  if (
    !control.registered ||
    !control.backup_at ||
    control.backup_at > now ||
    now - control.backup_at >= retention().backups ||
    db.prepare('SELECT restored FROM identity_control').get().restored !== 1
  )
    throw refusal();
  const { registry, key } = authority(path);
  try {
    registry.exec('BEGIN IMMEDIATE');
    const { state, dirty } = read(registry, key);
    if (!control.backup_tag || control.backup_tag !== backupProof(db, key)) throw refusal();
    if (
      dirty ||
      state.authTag !== mac(key, authKey.toString('base64')) ||
      state.lineage !== control.lineage ||
      (state.handoff ? state.path !== realpathSync(path) : state.path === realpathSync(path))
    )
      throw refusal();
    db.exec('BEGIN IMMEDIATE');
    const spaces = new Map(state.spaces.map((s) => [s.id, s]));
    for (const { id, owner_id } of db.prepare('SELECT id,owner_id FROM spaces').all()) {
      const current = spaces.get(id);
      if (!current || (current.delete_due !== null && current.delete_due <= now)) {
        purgeSpace(db, id, now);
        continue;
      }
      const amountsBefore = financialProof(db, id, key);
      if (owner_id !== current.owner_id) {
        if (
          !db
            .prepare('SELECT 1 FROM memberships WHERE space_id=? AND user_id=? AND IsDeleted=0')
            .get(id, current.owner_id)
        )
          throw refusal();
        db.prepare('UPDATE spaces SET owner_id=?,creation_key=lower(hex(randomblob(16))) WHERE id=?').run(
          current.owner_id,
          id,
        );
      }
      db.prepare('UPDATE spaces SET delete_due=? WHERE id=?').run(current.delete_due, id);
      for (const m of db
        .prepare('SELECT user_id FROM memberships WHERE space_id=? AND IsDeleted=0')
        .all(id)) {
        const live = state.members.find((x) => x.space_id === id && x.user_id === m.user_id);
        if (live)
          db.prepare('UPDATE memberships SET role=? WHERE space_id=? AND user_id=?').run(
            live.role,
            id,
            m.user_id,
          );
        else
          db.prepare(
            'UPDATE memberships SET IsDeleted=1,DeletedAt=?,ModifiedAt=? WHERE space_id=? AND user_id=?',
          ).run(new Date(now).toISOString(), new Date(now).toISOString(), id, m.user_id);
      }
      for (const f of state.filters.filter((f) => f.space_id === id)) {
        redact(db, id, f.digest, authKey);
        db.prepare('INSERT OR REPLACE INTO privacy_filters VALUES(?,?,?)').run(id, f.digest, f.created);
      }
      if (financialProof(db, id, key) !== amountsBefore) throw refusal();
    }
    for (const table of [
      'space_invites',
      'ownership_transfers',
      'sessions',
      'mail_jobs',
      'challenges',
      'recovery_codes',
      'registration_intents',
      'export_grants',
      'privacy_notices',
      'privacy_audit',
    ])
      db.exec('DELETE FROM ' + table);
    db.exec('UPDATE users SET pending_email=NULL');
    for (const { id } of db.prepare('SELECT id FROM users').all()) {
      const live = state.users.find((u) => u.id === id);
      if (!live) {
        db.prepare("UPDATE users SET lifecycle='PendingClosure' WHERE id=?").run(id);
        if (!finishClosure(db, id, now, authKey)) throw refusal();
      } else {
        if (identitySignature(db, key, id)?.hash !== live.hash) throw refusal();
        db.prepare('UPDATE users SET lifecycle=? WHERE id=?').run(live.lifecycle, id);
        db.prepare('UPDATE credentials SET last_step=max(last_step,?) WHERE user_id=?').run(live.step, id);
      }
    }
    db.exec('DELETE FROM privacy_cases');
    for (const saved of state.cases) {
      const [c, messages] = JSON.parse(unseal(key, 'case:' + saved.id, saved.packet));
      db.prepare(
        'INSERT INTO privacy_cases(id,subject,handler,received,due,state,closed,retain_until,hold_reason) VALUES(?,?,?,?,?,?,?,?,?)',
      ).run(c.id, c.subject, c.handler, c.received, c.due, c.state, c.closed, c.retain_until, c.hold_reason);
      for (const m of messages)
        db.prepare('INSERT INTO privacy_messages VALUES(?,?,?,?)').run(c.id, m.at, m.sender, m.text);
    }
    for (const r of state.receipts) {
      if (!db.prepare('SELECT 1 FROM memberships WHERE space_id=? AND user_id=?').get(r.space_id, r.user_id))
        continue;
      db.prepare(
        "INSERT INTO receipts(space_id,user_id,request_id,period,status) VALUES(?,?,?,?,'closed') ON CONFLICT(space_id,user_id,request_id) DO UPDATE SET status='closed' WHERE receipts.status='pending'",
      ).run(r.space_id, r.user_id, r.request_id, r.period);
    }
    db.exec(`UPDATE receipts SET status='closed' WHERE status='pending';
      UPDATE receipts SET fingerprint=NULL,result_id=NULL;
      UPDATE legacy_receipts SET canonical=json_object('period',CASE WHEN scope='open' THEN json_extract(canonical,'$.period') ELSE scope END,'retired',1)`);
    if (
      db.prepare('PRAGMA foreign_key_check').all().length ||
      db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      db
        .prepare(
          "SELECT 1 FROM spaces s WHERE NOT EXISTS(SELECT 1 FROM memberships m WHERE m.space_id=s.id AND m.user_id=s.owner_id AND m.role='owner' AND m.IsDeleted=0)",
        )
        .get()
    )
      throw refusal();
    // Switch the single authoritative path first. Failure leaves the new file quarantined.
    save(registry, key, { ...state, path: realpathSync(path), handoff: true });
    registry.exec('COMMIT');
    db.exec(
      'UPDATE privacy_control SET released=1,backup_at=NULL,backup_tag=NULL; UPDATE identity_control SET restored=0; COMMIT',
    );
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
    registry.close();
  }
}
