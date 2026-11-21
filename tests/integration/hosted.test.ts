import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { hostedSettings } from '../../src/server/hosted-config.mjs';
import {
  initializeHostedDatabase,
  checkHostedDatabase,
  prepareHostedDatabase,
} from '../../src/server/hosted-database.mjs';
import { allowTransition } from '../../src/server/transition.mjs';
import { connect, migrate } from '../../src/server/storage.mjs';
import { lockDatabase } from '../../scripts/instance-lock.mjs';
import { startBackgroundJobs } from '../../src/server/background-jobs.mjs';
import { createBackup, restoreBackup } from '../../src/server/local-files.mjs';
import { reconcile } from '../../src/server/recovery-registry.mjs';
import { createSpace } from '../../src/modules/spaces/schema.mjs';
import { authorizeSpace } from '../../src/modules/spaces/access';
import { applyCommand, readMonth } from '../../src/modules/finance/infrastructure/repository';
import { balance, realized } from '../../src/modules/finance/domain/projections';
import type { Action } from '../../src/modules/finance/domain/actions';

const directories: string[] = [];
function setup() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'omeumes-test-hosted-'));
  directories.push(root);
  mkdirSync(join(root, 'database'));
  mkdirSync(join(root, 'authority'));
  for (const key of Object.keys(process.env))
    if (
      /^OMEUMES_TEST_/.test(key) ||
      ['OMEUMES_BUILD_DIR', 'OMEUMES_RECOVERY_SCOPE', 'OMEUMES_RELEASED_PATH'].includes(key)
    )
      vi.stubEnv(key, undefined);
  const env = {
    OMEUMES_RUNTIME: 'hosted',
    OMEUMES_DATA_ROOT: root,
    OMEUMES_DB_PATH: join(root, 'database', 'hosted.sqlite'),
    OMEUMES_RECOVERY_REGISTRY: join(root, 'authority', 'recovery.sqlite'),
    OMEUMES_AUTH_KEY: randomBytes(32).toString('base64'),
    OMEUMES_RECOVERY_KEY: randomBytes(32).toString('base64'),
    OMEUMES_AUTH_ORIGIN: 'https://omeumes.example.invalid',
    OMEUMES_MAIL_TRANSPORT: 'brevo',
    BREVO_API_KEY: 'synthetic-never-sent',
    BREVO_SENDER: 'sender@example.invalid',
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return hostedSettings();
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const path of directories.splice(0)) {
    if (path.startsWith(join(realpathSync(tmpdir()), 'omeumes-test-hosted-')))
      rmSync(path, { recursive: true, force: true, maxRetries: 5 });
  }
});

it('fresh hosted init is explicit, empty, registered and refuses to overwrite; test flags cannot authorize it', () => {
  const { path } = setup();
  expect(() => allowTransition(path)).toThrow('init');
  expect(() => migrate(path, undefined, true)).toThrow('init');
  expect(() => prepareHostedDatabase()).toThrow('init');
  initializeHostedDatabase();
  checkHostedDatabase(path);
  const db = connect(path);
  try {
    for (const table of ['users', 'spaces', 'months', 'accounts', 'categories', 'events'])
      expect(db.prepare('SELECT count(*) AS n FROM ' + table).get()?.n).toBe(0);
  } finally {
    db.close();
  }
  const before = readFileSync(path);
  expect(() => initializeHostedDatabase()).toThrow('novas');
  expect(readFileSync(path)).toEqual(before);
  vi.stubEnv('OMEUMES_TEST_MODE', '1');
  expect(() => allowTransition(path, true)).toThrow('teste');
});

it('hosted config refuses local paths, test mail and shared keys; incompatible schemas remain unchanged', () => {
  const { path } = setup();
  vi.stubEnv('OMEUMES_MAIL_TRANSPORT', 'test');
  expect(() => initializeHostedDatabase()).toThrow('Brevo');
  vi.stubEnv('OMEUMES_MAIL_TRANSPORT', 'brevo');
  vi.stubEnv('OMEUMES_RECOVERY_KEY', process.env.OMEUMES_AUTH_KEY!);
  expect(() => initializeHostedDatabase()).toThrow('independentes');
  vi.stubEnv('OMEUMES_RECOVERY_KEY', randomBytes(32).toString('base64'));
  initializeHostedDatabase();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=8');
  db.close();
  const before = readFileSync(path);
  expect(() => prepareHostedDatabase()).toThrow('snapshot');
  vi.stubEnv('OMEUMES_OFFLINE_SNAPSHOT', 'confirmed');
  expect(() => prepareHostedDatabase()).toThrow('autorizar');
  expect(readFileSync(path)).toEqual(before);
  vi.stubEnv('OMEUMES_DB_PATH', join(process.cwd(), 'data', 'o-meu-mes.sqlite'));
  expect(() => hostedSettings()).toThrow('pasta database');
});

it('saved cents and receipt survive prepare/reopen and reconciled backup; maintenance runs and duplicate supervisors refuse', async () => {
  const { path, root, config } = setup();
  initializeHostedDatabase();
  let db = connect(path);
  const userId = randomUUID(),
    now = Date.now(),
    period = '2028-11';
  db.exec('BEGIN IMMEDIATE');
  db.prepare(
    "INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created) VALUES(?,'Ana','Sintética','ana@example.invalid',1,'PT',?,?)",
  ).run(userId, now, now);
  const spaceId = createSpace(db, userId, 'Aceitação alojada', randomUUID()).id as string;
  const ctx = authorizeSpace(db, userId, spaceId, 'write');
  function command(action: Action, requestId: string = randomUUID()) {
    const revision = readMonth(db, ctx).revision;
    return applyCommand(db, ctx, { action, period, requestId, revision }, config.key);
  }
  try {
    command({ type: 'month', period });
    command({
      type: 'account',
      account: { id: 'bank', name: 'Banco fictício', color: '#446677', restricted: false },
    });
    command({ type: 'category', category: { id: 'group', name: 'Teste' } });
    command({ type: 'initial', source: 'a:bank', amount: 10000 });
    command({
      type: 'line',
      line: {
        id: 'food',
        name: 'Teste',
        kind: 'expense',
        accountId: 'bank',
        categoryId: 'group',
        plan: 1234,
      },
    });
    command(
      {
        type: 'execute',
        lineId: 'food',
        amount: 1234,
        source: 'a:bank',
        date: period + '-02',
        complete: true,
      },
      'saved-payment',
    );
    db.exec('COMMIT');
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
  }
  prepareHostedDatabase();
  const lock = lockDatabase(path);
  expect(() => lockDatabase(path)).toThrow('instância');
  lock.close();
  const jobs = startBackgroundJobs(path, config);
  try {
    await vi.waitFor(
      () => {
        const read = connect(path);
        try {
          expect(
            read.prepare('SELECT last_cleanup FROM privacy_control').get()?.last_cleanup,
          ).toBeGreaterThan(0);
        } finally {
          read.close();
        }
      },
      { timeout: 6000, interval: 100 },
    );
    expect(jobs.healthy()).toBe(true);
  } finally {
    await jobs.stop();
  }
  const backup = await createBackup(path);
  const recovered = join(root, 'database', 'recovered.sqlite');
  await restoreBackup(backup.path, recovered, path);
  vi.stubEnv('OMEUMES_DB_PATH', recovered);
  migrate(recovered);
  expect(() => checkHostedDatabase(recovered)).toThrow('quarentena');
  db = connect(recovered);
  try {
    reconcile(db, recovered, config.key);
  } finally {
    db.close();
  }
  checkHostedDatabase(recovered);
  db = connect(recovered);
  try {
    const month = readMonth(db, ctx, period).state.months[period];
    expect(realized(month, 'food')).toBe(1234);
    expect(balance(month, 'a:bank')).toBe(8766);
    expect(month.events).toHaveLength(1);
    expect(db.prepare("SELECT status FROM receipts WHERE request_id='saved-payment'").get()?.status).toBe(
      'confirmed',
    );
  } finally {
    db.close();
  }
});
