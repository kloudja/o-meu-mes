import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { executeIdentity } from '../../src/modules/identity/account';
import { maintenance } from '../../src/modules/identity/mail.mjs';
import { policy, settings } from '../../src/modules/identity/policy.mjs';
import { digest } from '../../src/modules/identity/secrets.mjs';
import { createSpace } from '../../src/modules/spaces/schema.mjs';
import { changeSharing } from '../../src/modules/spaces/sharing';
import { createBackup, restoreBackup } from '../../src/server/local-files.mjs';
import { connect, migrate, migrations } from '../../src/server/storage.mjs';

const root = realpathSync(tmpdir());
const roots: string[] = [];
const now = 1_800_000_000_000;
const credentials = {
  action: 'register',
  firstName: 'Ana',
  lastName: 'Sintética',
  country: 'PT',
  adult: true,
  terms: 'dev-2',
  email: 'ana-sintetica@example.invalid',
  password: 'Uma frase longa de ensaio',
} as const;
function directory() {
  const value = mkdtempSync(join(root, 'omeumes-test-mu4-store-'));
  roots.push(value);
  return value;
}
afterEach(() => {
  for (const value of roots.splice(0)) {
    const resolved = realpathSync(value);
    if (dirname(resolved) !== root || !basename(resolved).startsWith('omeumes-test-mu4-store-'))
      throw new Error('Diretório de ensaio inesperado.');
    rmSync(resolved, { recursive: true, force: true, maxRetries: 5 });
  }
});
function setup(db: ReturnType<typeof connect>) {
  const owner = randomUUID();
  db.prepare(`INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created)
    VALUES(?,'Dono','Sintético','dono@example.invalid',1,'PT',?,?)`).run(owner, now, now);
  db.exec('BEGIN IMMEDIATE');
  const request = randomUUID();
  const space = createSpace(db, owner, 'Espaço para ensaio', request).id;
  db.exec('COMMIT');
  return { owner, space, request };
}

it('A43 MU4: arranque e CLI recusam v7 antes de escrita; migração falhada reverte; restauro v7/v8 em quarentena', async () => {
  const folder = directory();
  const path = join(folder, 'synthetic.sqlite');
  const mu3 = migrations.slice(0, 7);
  migrate(path, mu3, true);
  const original = connect(path);
  const { owner, space, request } = setup(original);
  const member = randomUUID();
  original
    .prepare(`INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created)
    VALUES(?,'Editor','Sintético','editor@example.invalid',1,'PT',?,?)`)
    .run(member, now, now);
  original.prepare("INSERT INTO memberships(space_id,user_id,role) VALUES(?,?,'editor')").run(space, member);
  original.prepare('INSERT INTO months(space_id,period) VALUES(?,?)').run(space, '2028-02');
  const before = original.prepare('SELECT * FROM memberships ORDER BY user_id').all();
  original.close();
  const bytes = readFileSync(path);
  const names = readdirSync(folder);
  // Let Windows choose an unused ephemeral port; start is refused before a server opens the DB.
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  for (const args of [['scripts/migrate.mjs'], ['scripts/next.mjs', 'start']]) {
    const refused = spawnSync(process.execPath, args, {
      env: {
        ...process.env,
        OMEUMES_TEST_MODE: '1',
        OMEUMES_DB_PATH: path,
        OMEUMES_TEST_TRANSITION: '',
        OMEUMES_TEST_PORT: String(port),
        OMEUMES_MAIL_TRANSPORT: 'test',
      },
      timeout: 7500,
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(refused.status, refused.stderr).toBe(1);
    expect(refused.stderr).toContain('Transição multiutilizador por autorizar.');
    expect(readFileSync(path)).toEqual(bytes);
    expect(readdirSync(folder)).toEqual(names);
  }

  const backup7 = await createBackup(path);
  expect(() => migrate(path, [...mu3, migrations[7] + 'SELECT * FROM injected_mu4_failure;'], true)).toThrow(
    'injected_mu4_failure',
  );
  expect(readFileSync(path)).toEqual(bytes);
  const restored7 = join(folder, 'recover-v7.sqlite');
  await restoreBackup(backup7.path, restored7, path);
  const verifyCopy = (candidate: string, version: number) => {
    const db = connect(candidate);
    try {
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(version);
      expect(db.prepare('SELECT restored FROM identity_control').get()?.restored).toBe(1);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('SELECT * FROM memberships ORDER BY user_id').all()).toEqual(before);
      expect(db.prepare('SELECT period FROM months WHERE space_id=?').get(space)?.period).toBe('2028-02');
    } finally {
      db.close();
    }
  };
  expect(migrate(restored7, mu3).version).toBe(7);
  verifyCopy(restored7, 7);
  expect(migrate(path, migrations.slice(0, 8), true).version).toBe(8);
  expect(migrate(path, migrations.slice(0, 8)).version).toBe(8);
  const active = connect(path);
  try {
    active.exec('BEGIN IMMEDIATE');
    expect(createSpace(active, owner, 'Espaço para ensaio', request).id).toBe(space);
    expect(active.prepare('SELECT * FROM memberships ORDER BY user_id').all()).toEqual(before);
    active.exec('COMMIT');
  } finally {
    active.close();
  }
  const backup8 = await createBackup(path);
  const restored8 = join(folder, 'recover-v8.sqlite');
  await restoreBackup(backup8.path, restored8, path);
  expect(migrate(restored8, migrations.slice(0, 8)).version).toBe(8);
  verifyCopy(restored8, 8);
});

it('A06/A41 MU4: expirar durante a verificação mantém a conta; convite nunca partilhado é limpo', () => {
  const path = join(directory(), 'registration.sqlite');
  migrate(path, undefined, true);
  const db = connect(path);
  try {
    const { owner, space } = setup(db);
    const config = settings({
      OMEUMES_AUTH_KEY: randomBytes(32).toString('base64'),
      OMEUMES_INVITE_DAYS: '1',
    });
    db.exec('BEGIN IMMEDIATE');
    const issue = changeSharing(
      db,
      config,
      space,
      owner,
      { action: 'issue', email: credentials.email, role: 'reader' },
      now,
    ) as { id: string; code: string; expires: number };
    const unshared = changeSharing(
      db,
      config,
      space,
      owner,
      { action: 'issue', email: 'nunca-partilhado@example.invalid', role: 'editor' },
      now,
    ) as { id: string; code: string; expires: number };
    db.exec('COMMIT');
    expect(issue.expires).toBe(now + policy.day);
    expect(db.prepare('SELECT count(*) AS n FROM mail_jobs').get()?.n).toBe(0);
    executeIdentity(db, config, { ...credentials, invite: issue.code }, '', now);
    const userId = String(db.prepare('SELECT id FROM users WHERE email=?').get(credentials.email)?.id);
    expect(db.prepare('SELECT digest FROM registration_intents WHERE user_id=?').get(userId)?.digest).toBe(
      digest(issue.code),
    );
    expect(db.prepare('SELECT count(*) AS n FROM memberships').get()?.n).toBe(1);
    const verify = randomBytes(32).toString('base64url');
    db.prepare("UPDATE challenges SET digest=?,expires=? WHERE user_id=? AND kind='verify'").run(
      digest(verify),
      issue.expires + 10_000,
      userId,
    );
    db.exec('BEGIN IMMEDIATE');
    maintenance(db, issue.expires);
    db.exec('COMMIT');
    expect(db.prepare('SELECT address,status FROM space_invites WHERE id=?').get(unshared.id)).toMatchObject({
      address: null,
      status: 'expired',
    });
    const verified = executeIdentity(
      db,
      config,
      { action: 'verify', token: verify, password: credentials.password },
      '',
      issue.expires,
    );
    expect(verified.message).toContain('O convite deixou de estar disponível');
    expect(db.prepare('SELECT verified FROM users WHERE id=?').get(userId)?.verified).toBe(1);
    expect(db.prepare('SELECT 1 FROM memberships WHERE user_id=?').get(userId)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM registration_intents WHERE user_id=?').get(userId)).toBeUndefined();
    db.exec('BEGIN IMMEDIATE');
    maintenance(db, issue.expires + policy.operationalRetention);
    db.exec('COMMIT');
    expect(db.prepare('SELECT count(*) AS n FROM space_invites').get()?.n).toBe(0);
  } finally {
    db.close();
  }
});
