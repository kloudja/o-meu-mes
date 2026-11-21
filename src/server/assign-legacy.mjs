import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, unlinkSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { connect } from './storage.mjs';
import { verifyCopy } from './local-files.mjs';
import { allowTransition, assertSynthetic } from './transition.mjs';
import { financialTables } from '../modules/spaces/schema.mjs';
import { reversalInserts } from '../modules/spaces/schema-mu3.mjs';

const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
/** Offline, single assignment from a standalone pre-identity financial backup. */
export function assignLegacy(sourcePath, destinationPath, userId, spaceId, fault = (_table) => {}) {
  assertSynthetic(sourcePath);
  try {
    allowTransition(destinationPath, false, 6);
  } catch {
    assertSynthetic(destinationPath);
    allowTransition(destinationPath);
  }
  if (!guid.test(userId) || !guid.test(spaceId) || resolve(sourcePath) === resolve(destinationPath))
    throw new Error('Indique a origem, o GUID confirmado e o espaço privado de destino.');
  if (['-wal', '-shm', '-journal'].some((suffix) => existsSync(sourcePath + suffix)))
    throw new Error('Escolha uma cópia autónoma encerrada.');
  const bytes = readFileSync(sourcePath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const directory = mkdtempSync(join(tmpdir(), 'omeumes-test-assignment-'));
  const copy = join(directory, 'source.sqlite');
  try {
    writeFileSync(copy, bytes, { flag: 'wx' });
    verifyCopy(copy);
    const source = new DatabaseSync(copy, { readOnly: true });
    try {
      const db = connect(destinationPath);
      try {
        return assignFinancialRows(source, db, userId, spaceId, hash, fault);
      } finally {
        db.close();
      }
    } finally {
      source.close();
    }
  } finally {
    if (existsSync(copy)) unlinkSync(copy);
    rmdirSync(directory);
  }
}

// Offline assignment of a verified standalone backup into an existing private space.
export function assignFinancialRows(source, db, userId, spaceId, hash, fault = (_table) => {}) {
  if (!guid.test(userId) || !guid.test(spaceId) || !/^[a-f0-9]{64}$/.test(hash))
    throw new Error('Destinatário ou referência de origem inválidos.');
  if (source.prepare('PRAGMA user_version').get().user_version !== 4)
    throw new Error('É necessária uma origem financeira v4.');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (
      !db
        .prepare(`SELECT 1 FROM memberships m JOIN spaces s ON s.id=m.space_id AND s.owner_id=m.user_id
     JOIN users u ON m.user_id=u.id WHERE u.verified=1 AND m.user_id=? AND s.id=? AND m.role='owner'
     AND m.IsDeleted=0 AND s.IsDeleted=0 AND (SELECT restored FROM identity_control WHERE id=1)=0`)
        .get(userId, spaceId)
    )
      throw new Error('O destino deve ser um espaço privado do utilizador confirmado.');
    const previous = db.prepare('SELECT * FROM legacy_assignment WHERE id=1').get();
    if (previous) {
      if (previous.space_id !== spaceId || previous.user_id !== userId || previous.source_hash !== hash)
        throw new Error('Já existe uma atribuição diferente.');
      db.exec('COMMIT');
      return { replay: true };
    }
    if (
      db.prepare('SELECT revision FROM meta WHERE space_id=?').get(spaceId)?.revision !== 0 ||
      [...financialTables, 'receipts', 'legacy_receipts'].some((t) =>
        db.prepare(`SELECT 1 FROM ${t} WHERE space_id=? LIMIT 1`).get(spaceId),
      )
    )
      throw new Error('O espaço de destino já contém dados.');
    for (const table of [...financialTables, 'receipts']) {
      const target = table === 'receipts' ? 'legacy_receipts' : table;
      const columns = source
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      const insert = db.prepare(
        `INSERT INTO ${target}(space_id,${columns.join(',')}) VALUES(?,${columns.map(() => '?').join(',')})`,
      );
      for (const row of source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate())
        insert.run(spaceId, ...columns.map((c) => row[c]));
      fault(table);
    }
    const revision = source.prepare('SELECT revision FROM meta WHERE id=1').get().revision;
    if (db.prepare('PRAGMA user_version').get().user_version >= 7) {
      for (const statement of reversalInserts(true)) db.prepare(statement).run(spaceId);
      db.prepare('UPDATE meta SET revision=?,mu3_start=? WHERE space_id=?').run(revision, revision, spaceId);
    } else db.prepare('UPDATE meta SET revision=? WHERE space_id=?').run(revision, spaceId);
    db.prepare('INSERT INTO legacy_assignment(id,space_id,user_id,source_hash) VALUES(1,?,?,?)').run(
      spaceId,
      userId,
      hash,
    );
    if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Referências inválidas.');
    db.exec('COMMIT');
    return { replay: false };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
