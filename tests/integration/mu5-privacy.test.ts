import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { hashSync } from '@node-rs/argon2';
import { connect, migrate, migrations } from '../../src/server/storage.mjs';
import { provisionRegistry, reconcile } from '../../src/server/recovery-registry.mjs';
import { createBackup, restoreBackup } from '../../src/server/local-files.mjs';
import { rotateBackups } from '../../src/server/rotate-backups.mjs';
import { executeIdentity, readIdentity, verifiedUser } from '../../src/modules/identity/account';
import { seal } from '../../src/modules/identity/secrets.mjs';
import { settings, policy } from '../../src/modules/identity/policy.mjs';
import { maintenance } from '../../src/modules/identity/mail.mjs';
import { calendarDeadline } from '../../src/modules/privacy/deadline';
import { rights } from '../../src/modules/privacy/rights';
import { spaceExport } from '../../src/modules/finance/infrastructure/space-export';
import { authorizeSpace } from '../../src/modules/spaces/access';
import { createSpace } from '../../src/modules/spaces/schema.mjs';
import { changeSharing } from '../../src/modules/spaces/sharing';
import { load } from '../../src/modules/finance/infrastructure/state-tables';
import { applyCommand } from '../../src/modules/finance/infrastructure/repository';
import { balance } from '../../src/modules/finance/domain/projections';

const root = realpathSync(tmpdir());
const dirs: string[] = [];
const active = new Set<DatabaseSync>();
const password = 'Frase privada para o ensaio local';
const day = policy.day;
function directory() {
  const dir = mkdtempSync(join(root, 'omeumes-test-mu5-'));
  dirs.push(dir);
  return dir;
}
function open(path: string) {
  const db = connect(path, 5000);
  active.add(db);
  return db;
}
function close(db: DatabaseSync) {
  active.delete(db);
  db.close();
}
afterEach(() => {
  for (const db of active) db.close();
  active.clear();
  vi.unstubAllEnvs();
  for (const p of dirs.splice(0)) {
    const resolved = realpathSync(p);
    if (dirname(resolved) !== root || !basename(resolved).startsWith('omeumes-test-mu5-'))
      throw Error('Destino inesperado.');
    rmSync(resolved, { recursive: true, force: true, maxRetries: 5 });
  }
});
function tx<T>(db: DatabaseSync, fn: () => T) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
  }
}
async function recoveryHttp(
  path: string,
  blocked: boolean,
  owner: string,
  space: string,
  oldCookie: string,
  inviteCode?: string,
) {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((done) => probe.close(() => done()));
  const url = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, ['scripts/next.mjs', 'start', '--base', path], {
    env: {
      ...process.env,
      OMEUMES_TEST_MODE: '1',
      OMEUMES_TEST_PORT: String(port),
      OMEUMES_AUTH_ORIGIN: url,
      OMEUMES_DB_PATH: path,
      OMEUMES_MAIL_TRANSPORT: 'test',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (b) => (output += b));
  server.stderr.on('data', (b) => (output += b));
  const done = once(server, 'close');
  try {
    let response: Response | undefined;
    for (let n = 0; n < 120 && server.exitCode === null; n++) {
      response = await fetch(url + '/api/identity').catch(() => undefined);
      if (response) break;
      await delay(100);
    }
    expect(response?.status, output).toBe(blocked ? 503 : 200);
    const headers = {
      'Content-Type': 'application/json',
      Origin: url,
      'X-Account': owner,
      Cookie: 'omeumes-session=' + oldCookie,
    };
    expect((await fetch(url + '/api/state?spaceId=' + space, { headers })).status).toBe(blocked ? 503 : 403);
    if (blocked && inviteCode) {
      const accept = await fetch(url + '/api/sharing', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'acceptInvite', code: inviteCode }),
      });
      expect(accept.status).toBe(503);
    }
    const login = await fetch(url + '/api/identity', {
      method: 'POST',
      headers: { Origin: url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email: 'ana@example.invalid', password }),
    });
    expect(login.status, await login.clone().text()).toBe(blocked ? 503 : 200);
    if (!blocked) {
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      const state = await fetch(url + '/api/state?spaceId=' + space, {
        headers: { ...headers, Cookie: cookie },
      });
      expect(state.status).toBe(200);
      expect((await state.json()).periods).toEqual(['2028-02']);
    }
  } finally {
    server.kill();
    await done;
  }
}
function addUser(db: DatabaseSync, email: string, now: number) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users(id,first_name,last_name,email,country,adult_at,created,verified) VALUES(?,'Pessoa','Sintética',?,'PT',?,?,1)",
  ).run(id, email, now, now);
  db.prepare('INSERT INTO credentials(user_id,password_hash) VALUES(?,?)').run(id, hashSync(password));
  return id;
}

it('MU6 manutenção horária retoma após uma falha de armazenamento e limpa só os registos vencidos', async () => {
  const path = join(directory(), 'maintenance.sqlite');
  migrate(path, undefined, true);
  const db = open(path);
  const start = Date.UTC(2028, 0, 10, 12);
  const next = start + policy.maintenanceInterval;
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((done) => probe.close(() => done()));
  const child = spawn(
    process.execPath,
    ['--import', new URL('./mu6-clock.mjs', import.meta.url).href, 'scripts/next.mjs', 'start'],
    {
      env: {
        ...process.env,
        OMEUMES_TEST_MODE: '1',
        OMEUMES_DB_PATH: path,
        OMEUMES_AUTH_KEY: randomBytes(32).toString('base64'),
        OMEUMES_MAIL_TRANSPORT: 'test',
        OMEUMES_TEST_PORT: String(port),
        OMEUMES_AUTH_ORIGIN: 'http://127.0.0.1:' + port,
        OMEUMES_QA_CLOCK: String(start),
      },
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  );
  const stopped = once(child, 'close');
  let error = '';
  child.stderr!.on('data', (chunk) => {
    error += chunk.toString();
  });
  const lastCleanup = () => db.prepare('SELECT last_cleanup FROM privacy_control').get()?.last_cleanup;
  const ids = () => db.prepare("SELECT id FROM auth_limits WHERE id LIKE 'mu6-%' ORDER BY id").all();
  try {
    await expect.poll(lastCleanup, { timeout: 15000 }).toBe(start);
    db.prepare('INSERT INTO auth_limits VALUES(?,?,1),(?,?,1)').run(
      'mu6-expira',
      next - policy.day,
      'mu6-valido',
      start,
    );
    db.exec(
      "CREATE TRIGGER mu6_stop_cleanup BEFORE UPDATE OF last_cleanup ON privacy_control BEGIN SELECT RAISE(ABORT,'indisponibilidade sintética'); END;",
    );
    child.send(next);
    await expect.poll(() => error, { timeout: 7000 }).toContain('temporariamente indisponível');
    expect(lastCleanup()).toBe(start);
    expect(ids()).toHaveLength(2);
    db.exec('DROP TRIGGER mu6_stop_cleanup');
    await expect.poll(lastCleanup, { timeout: 7000 }).toBe(next);
    expect(ids()).toEqual([{ id: 'mu6-valido' }]);
  } finally {
    child.kill();
    await stopped;
  }
});
function setup() {
  const dir = directory(),
    path = join(dir, 'finance.sqlite'),
    registry = join(directory(), 'authority.sqlite');
  const key = randomBytes(32).toString('base64');
  vi.stubEnv('OMEUMES_RECOVERY_REGISTRY', registry);
  vi.stubEnv('OMEUMES_AUTH_KEY', key);
  vi.stubEnv('OMEUMES_RECOVERY_KEY', randomBytes(32).toString('base64'));
  migrate(path, undefined, true);
  const db = open(path),
    now = Date.now(),
    config = settings(),
    owner = addUser(db, 'ana@example.invalid', now),
    member = addUser(db, 'bruno@example.invalid', now);
  const handler = addUser(db, 'operador@example.invalid', now);
  vi.stubEnv('OMEUMES_RIGHTS_HANDLER', handler);
  db.prepare('UPDATE credentials SET totp=? WHERE user_id=?').run('configurado-na-fixture', handler);
  const space = tx(db, () => String(createSpace(db, owner, 'Orçamento sintético', randomUUID()).id));
  db.prepare("INSERT INTO memberships(space_id,user_id,role) VALUES(?,?,'reader')").run(space, member);
  const login = (email: string) =>
    executeIdentity(db, config, { action: 'login', email, password }, '', now).cookie!;
  return { dir, db, path, registry, config, owner, member, handler, space, now, login };
}

it('A17/A18/A26/A30/A38/A40: cópia anterior só abre após cruzamento com autoridade atual, preservando 85 EUR', async () => {
  const f = setup(),
    { db, space, member, owner, handler, config, now, path } = f;
  const period = '2028-02',
    text = 'referência privada sintética';
  const cash = 'a:conta';
  const commands = [
    { type: 'month', period },
    { type: 'account', account: { id: 'conta', name: text, color: '#123456', restricted: false } },
    { type: 'category', category: { id: 'c', name: 'Categoria' } },
    { type: 'initial', source: cash, amount: 10000 },
    {
      type: 'line',
      line: { id: 'l', name: text, kind: 'expense', accountId: 'conta', categoryId: 'c', plan: 1500 },
    },
    { type: 'snapshot', date: period + '-01' },
    {
      type: 'execute',
      lineId: 'l',
      amount: 1500,
      source: cash,
      description: text,
      date: period + '-02',
      complete: true,
    },
  ] as const;
  let revision = 0;
  const paymentId = randomUUID();
  for (const action of commands)
    tx(db, () => {
      revision = applyCommand(
        db,
        authorizeSpace(db, owner, space, 'write'),
        { period, revision, requestId: action.type === 'execute' ? paymentId : randomUUID(), action },
        config.key,
      ).revision;
    });
  const oldCookie = f.login('bruno@example.invalid');
  const removedSpace = tx(db, () => String(createSpace(db, member, 'Privado a eliminar', randomUUID()).id));
  tx(db, () =>
    db
      .prepare('INSERT INTO excel_imports(space_id,period,payload) VALUES(?,?,?)')
      .run(space, period, JSON.stringify({ cells: { A1: { note: text } } })),
  );
  db.prepare('INSERT INTO legacy_receipts(space_id,scope,request_id,canonical) VALUES(?,?,?,?)').run(
    space,
    period,
    'old-ref',
    JSON.stringify({ note: text }),
  );
  const invite = tx(db, () =>
    changeSharing(
      db,
      config,
      space,
      owner,
      { action: 'issue', email: 'bruno@example.invalid', role: 'editor' },
      now,
    ),
  ) as { code: string };
  const mailId = randomUUID();
  db.prepare(
    "INSERT INTO mail_jobs(id,user_id,kind,payload,locale,status,available,created,priority) VALUES(?,?,'notice',?,'pt-PT','pending',?,?,0)",
  ).run(
    mailId,
    member,
    seal(config.key, 'mail:' + mailId, JSON.stringify({ to: text + '@example.invalid', token: '' })),
    now,
    now,
  );
  provisionRegistry(db, path);
  const backup = await createBackup(path);
  tx(db, () => changeSharing(db, config, space, owner, { action: 'remove', memberId: member }, now + 1));
  tx(db, () => rights(db, member, false, { action: 'submit', text: 'Retirar ' + text }, now + 2, config.key));
  const id = String(db.prepare('SELECT id FROM privacy_cases').get()?.id);
  expect(() =>
    tx(db, () =>
      rights(
        db,
        owner,
        false,
        { action: 'redact', id, spaceId: space, text, reason: 'Pedido avaliado' },
        now,
        config.key,
      ),
    ),
  ).toThrow();
  tx(db, () =>
    rights(
      db,
      handler,
      true,
      { action: 'redact', id, spaceId: space, text, reason: 'Identificação desnecessária confirmada.' },
      now + 2,
      config.key,
    ),
  );
  const checkFinance = (db: DatabaseSync) =>
    tx(db, () => {
      const state = load(db, authorizeSpace(db, owner, space, 'read'), period);
      expect(balance(state.months[period], cash)).toBe(8500);
      expect(state.months[period].events[0].amount).toBe(1500);
      for (const t of [
        'accounts',
        'lines',
        'events',
        'snapshots',
        'excel_imports',
        'legacy_receipts',
        'privacy_messages',
        'privacy_audit',
      ])
        expect(JSON.stringify(db.prepare('SELECT * FROM ' + t).all())).not.toContain(text);
      expect(() => db.prepare('UPDATE snapshots SET payload=payload WHERE space_id=?').run(space)).toThrow(
        'immutable snapshot',
      );
      const grant = spaceExport(db, space, owner, { action: 'prepare' }, now) as { token: string };
      const exported = spaceExport(db, space, owner, { action: 'download', token: grant.token }, now);
      expect(JSON.stringify(exported)).not.toContain(text);
      expect(exported).toMatchObject({
        format: 'o-meu-mes-export',
        months: { [period]: { events: [{ amount: 1500 }] } },
      });
      expect(() => spaceExport(db, space, owner, { action: 'download', token: grant.token }, now)).toThrow();
    });
  checkFinance(db);
  const notices = db.prepare('SELECT user_id,message FROM privacy_notices WHERE at=?').all(now + 2);
  expect(notices.map((n) => n.user_id).sort()).toEqual([owner, member].sort());
  expect(
    notices.every(
      (n) => String(n.message).includes('retirado conteúdo pessoal') && !String(n.message).includes(text),
    ),
  ).toBe(true);
  expect(db.prepare('SELECT 1 FROM mail_jobs WHERE id=?').get(mailId)).toBeUndefined();
  const closure = executeIdentity(
    db,
    config,
    { action: 'closeAccount', password },
    oldCookie,
    now + 3,
    member,
  ).cookie!;
  expect(readIdentity(db, closure, now + 3).account?.scope).toBe('closure');
  expect(() => verifiedUser(db, closure, member)).toThrow();
  executeIdentity(
    db,
    config,
    { action: 'deleteSpace', spaceId: removedSpace, password },
    closure,
    now + 4,
    member,
  );
  tx(db, () => maintenance(db, now + 8 * day, config.key));
  expect(db.prepare('SELECT 1 FROM spaces WHERE id=?').get(removedSpace)).toBeUndefined();
  expect(db.prepare('SELECT 1 FROM credentials WHERE user_id=?').get(member)).toBeUndefined();
  const register = {
    action: 'register',
    firstName: 'Nova',
    lastName: 'Pessoa',
    email: 'bruno@example.invalid',
    password,
    country: 'PT',
    terms: 'dev-2',
    adult: true,
  } as const;
  executeIdentity(db, config, register, '', now + 8 * day);
  const fresh = db.prepare('SELECT id FROM users WHERE email=?').get(register.email)!.id;
  expect(fresh).not.toBe(member);
  expect(db.prepare('SELECT 1 FROM memberships WHERE user_id=?').get(fresh)).toBeUndefined();
  const recovered = join(f.dir, 'restauro.sqlite');
  await restoreBackup(backup.path, recovered, path);
  migrate(recovered);
  await recoveryHttp(recovered, true, owner, space, oldCookie, invite.code);
  const copy = open(recovered);
  expect(() => readIdentity(copy, oldCookie, now)).toThrow(/reconciliação/);
  expect(() => reconcile(copy, recovered, config.key, now + 8 * day)).toThrow(/quarentena/); // dirty until the source commits its checkpoint
  close(db);
  const authority = new DatabaseSync(f.registry);
  const sql = String(authority.prepare('SELECT data FROM authority').get()?.data);
  expect(sql).not.toContain(text);
  expect(sql).not.toContain(password);
  expect(sql).not.toContain('bruno@example.invalid');
  authority.close();
  expect(() => reconcile(copy, recovered, config.key, now + 31 * day)).toThrow(/quarentena/);
  expect(() => reconcile(copy, recovered, randomBytes(32), now + 8 * day)).toThrow(/quarentena/);
  reconcile(copy, recovered, config.key, now + 8 * day);
  close(copy);
  const released = open(recovered);
  expect(released.prepare('SELECT count(*) AS n FROM sessions').get()?.n).toBe(0);
  expect(readIdentity(released, oldCookie, now + 8 * day).account).toBeNull();
  expect(() =>
    executeIdentity(
      released,
      config,
      { action: 'login', email: 'bruno@example.invalid', password },
      '',
      now + 8 * day,
    ),
  ).toThrow();
  expect(released.prepare('SELECT id FROM spaces WHERE id=?').get(removedSpace)).toBeUndefined();
  expect(released.prepare('SELECT 1 FROM space_invites').get()).toBeUndefined();
  expect(() =>
    tx(released, () =>
      changeSharing(
        released,
        config,
        null,
        member,
        { action: 'acceptInvite', code: invite.code },
        now + 8 * day,
      ),
    ),
  ).toThrow();
  expect(released.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  const session = executeIdentity(
    released,
    config,
    { action: 'login', email: 'ana@example.invalid', password },
    '',
    now + 8 * day,
  ).cookie!;
  expect(readIdentity(released, session, now + 8 * day).account?.id).toBe(owner);
  checkFinance(released);
  expect(released.prepare('SELECT state FROM privacy_cases WHERE id=?').get(id)?.state).toBe('open');
  expect(() =>
    tx(released, () =>
      applyCommand(
        released,
        authorizeSpace(released, owner, space, 'write'),
        { period, revision, requestId: paymentId, action: commands[6] },
        config.key,
      ),
    ),
  ).toThrow(/referência já foi utilizada/);
  expect(released.prepare('SELECT count(*) AS n FROM events WHERE space_id=?').get(space)?.n).toBe(1);
  close(released);
  await recoveryHttp(recovered, false, owner, space, oldCookie);
  expect(() => open(path)).toThrow(/quarentena/);
});

it('A29/A42: mês civil, esclarecimento de ex-membro, prorrogação, recusa parcial, retenção excecional e limpeza repetida', () => {
  const { db, config, member, handler, owner, space } = setup();
  const now = Date.UTC(2028, 0, 31, 12);
  expect(calendarDeadline(now)).toBe(Date.UTC(2028, 2, 1) - 1);
  const command = (actor: string, data: unknown, at = now) =>
    tx(db, () => rights(db, actor, actor === handler, data, at, config.key));
  command(member, { action: 'submit', text: 'Pedir acesso às minhas referências' });
  const id = String(db.prepare('SELECT id FROM privacy_cases').get()?.id);
  tx(db, () => changeSharing(db, config, space, owner, { action: 'remove', memberId: member }, now));
  command(handler, { action: 'clarify', id, text: 'Indica o mês a que se refere o pedido.' });
  command(member, { action: 'reply', id, text: 'Janeiro.' });
  expect(command(owner, undefined)).toMatchObject({ cases: [] });
  expect(() => command(owner, { action: 'reply', id, text: 'intruso' })).toThrow();
  command(handler, { action: 'extend', id, text: 'É necessário consultar os destinatários anteriores.' });
  expect(db.prepare('SELECT due FROM privacy_cases').get()?.due).toBe(Date.UTC(2028, 4, 2, 23) - 1);
  command(handler, {
    action: 'answer',
    id,
    text: 'A tua referência foi facultada. As referências de terceiros foram omitidas.',
    decision: 'partial',
    recipients: 'O pedido de acesso não alterou dados comunicados.',
  });
  expect(JSON.stringify(command(member, undefined))).toContain('CNPD');
  expect(JSON.stringify(command(member, undefined))).toContain('tribunais');
  command(handler, { action: 'hold', id, reason: 'Revisão de contestação em curso.', days: 45 });
  tx(db, () => maintenance(db, now + 31 * day, config.key));
  expect(db.prepare('SELECT hold_reason FROM privacy_cases').get()?.hold_reason).toBeTruthy();
  for (let i = 0; i < 2; i++) tx(db, () => maintenance(db, now + 46 * day, config.key));
  expect(db.prepare('SELECT 1 FROM privacy_messages').get()).toBeUndefined();
  expect(db.prepare('SELECT 1 FROM privacy_cases').get()).toBeUndefined();
});

it('A16/A39: cancelamento antes do prazo, falha de expurgo atómica e retoma, exportação revalidada', () => {
  const { db, space, owner, member, config, login, now } = setup();
  const cookie = login('ana@example.invalid');
  const change = (action: 'deleteSpace' | 'cancelDeletion', at: number, c = cookie) =>
    executeIdentity(db, config, { action, spaceId: space, password }, c, at, owner);
  const grant = tx(db, () => spaceExport(db, space, owner, { action: 'prepare' }, now)) as { token: string };
  expect(() => tx(db, () => spaceExport(db, space, member, { action: 'prepare' }, now))).toThrow();
  expect(() =>
    tx(db, () => spaceExport(db, space, owner, { action: 'download', token: grant.token }, now + 60000)),
  ).toThrow();
  change('deleteSpace', now);
  tx(db, () => {
    authorizeSpace(db, member, space, 'read');
    expect(() => authorizeSpace(db, owner, space, 'write')).toThrow();
  });
  change('cancelDeletion', now + 1);
  tx(db, () => maintenance(db, now + 7 * day, config.key));
  expect(db.prepare('SELECT delete_due FROM spaces WHERE id=?').get(space)?.delete_due).toBeNull();
  const at = now + 8 * day;
  const again = executeIdentity(
    db,
    config,
    { action: 'login', email: 'ana@example.invalid', password },
    '',
    at,
  ).cookie!;
  change('deleteSpace', at, again);
  db.exec("CREATE TEMP TRIGGER fault BEFORE DELETE ON meta BEGIN SELECT RAISE(ABORT,'falha de ensaio'); END");
  expect(() => tx(db, () => maintenance(db, at + 7 * day, config.key))).toThrow('falha de ensaio');
  expect(db.prepare('SELECT count(*) AS n FROM memberships WHERE space_id=?').get(space)?.n).toBe(2);
  db.exec('DROP TRIGGER fault');
  tx(db, () => maintenance(db, at + 7 * day, config.key));
  expect(db.prepare('SELECT 1 FROM spaces WHERE id=?').get(space)).toBeUndefined();
});

it('A34: transição v8 autorizada, rollback v9, cópia anterior em quarentena e rotação só de cópias geridas', async () => {
  const dir = directory(),
    path = join(dir, 'sintetica.sqlite');
  const v8 = migrations.slice(0, 8);
  migrate(path, v8, true);
  const original = readFileSync(path);
  expect(() => migrate(path)).toThrow(/autorizar/);
  expect(readFileSync(path)).toEqual(original);
  expect(() => migrate(path, [...v8, migrations[8] + 'SELECT * FROM falha_mu5;'], true)).toThrow();
  expect(readFileSync(path)).toEqual(original);
  const backup = await createBackup(path);
  expect(migrate(path, undefined, true).version).toBe(9);
  expect(migrate(path).version).toBe(9);
  const old = join(dir, 'anterior.sqlite');
  await restoreBackup(backup.path, old, path);
  migrate(old, v8);
  const db = open(old);
  expect(db.prepare('SELECT restored FROM identity_control').get()?.restored).toBe(1);
  const now = Date.now();
  mkdirSync(join(dir, 'backups', 'manter'));
  expect(rotateBackups(path, now + 29 * day)).toBe(0);
  expect(rotateBackups(path, now + 31 * day)).toBe(1);
  expect(existsSync(backup.path)).toBe(false);
  expect(existsSync(old)).toBe(true);
});

it('A16/A18: recusa e expiração mantêm a propriedade; transferência aceite extingue a conta e o passe de exportação', () => {
  const { db, now, config, owner, member, space, login } = setup();
  const grant = tx(db, () => spaceExport(db, space, owner, { action: 'prepare' }, now)) as { token: string };
  const closure = executeIdentity(
    db,
    config,
    { action: 'closeAccount', password },
    login('ana@example.invalid'),
    now,
    owner,
  ).cookie!;
  const propose = (cookie: string, at: number) => {
    executeIdentity(
      db,
      config,
      { action: 'proposeTransfer', spaceId: space, memberId: member, password },
      cookie,
      at,
      owner,
    );
    return String(
      db.prepare("SELECT id FROM ownership_transfers WHERE space_id=? AND status='pending'").get(space)!.id,
    );
  };
  const first = propose(closure, now + 1);
  tx(db, () => changeSharing(db, config, space, member, { action: 'declineTransfer', id: first }, now + 2));
  const expired = propose(closure, now + 3);
  const then = now + 8 * day;
  tx(db, () => maintenance(db, then, config.key));
  expect(() =>
    tx(db, () => changeSharing(db, config, space, member, { action: 'acceptTransfer', id: expired }, then)),
  ).toThrow();
  expect(db.prepare('SELECT owner_id,delete_due FROM spaces WHERE id=?').get(space)).toEqual({
    owner_id: owner,
    delete_due: null,
  });
  const again = executeIdentity(
    db,
    config,
    { action: 'login', email: 'ana@example.invalid', password },
    '',
    then,
  ).cookie!;
  const next = propose(again, then + 1);
  tx(db, () => changeSharing(db, config, space, member, { action: 'acceptTransfer', id: next }, then + 2));
  expect(db.prepare('SELECT 1 FROM credentials WHERE user_id=?').get(owner)).toBeUndefined();
  expect(db.prepare('SELECT 1 FROM export_grants WHERE space_id=?').get(space)).toBeUndefined();
  expect(() =>
    tx(db, () => spaceExport(db, space, owner, { action: 'download', token: grant.token }, now + 5)),
  ).toThrow();
  expect(db.prepare("SELECT user_id FROM memberships WHERE space_id=? AND role='owner'").all(space)).toEqual([
    { user_id: member },
  ]);
});
