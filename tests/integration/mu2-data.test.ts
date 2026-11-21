import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { APP_ID, migrate, migrations } from '../../src/server/storage.mjs';
import { createBackup, restoreBackup } from '../../src/server/local-files.mjs';
import { assignLegacy } from '../../src/server/assign-legacy.mjs';
import { createSpace } from '../../src/modules/spaces/schema.mjs';
import { dispatchOne } from '../../src/modules/identity/mail.mjs';
import { settings } from '../../src/modules/identity/policy.mjs';

const period = '2028-11';
const following = '2028-12';
const account = 'banco-a';
const second = 'banco-b';
const reserve = 'reserva-um';
const origin = 'a:' + account;
const other = 'a:' + second;
const pot = 'r:' + reserve;
const financialTables = [
  'accounts',
  'categories',
  'reserves',
  'origins',
  'base_lines',
  'recurring',
  'months',
  'lines',
  'initials',
  'snapshots',
  'events',
  'effects',
  'allocations',
  'observations',
  'occurrences',
  'excel_imports',
  'receipts',
] as const;
const json = JSON.stringify;
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

const temp = realpathSync(tmpdir());
const directories: string[] = [];
function temporaryPath() {
  const directory = mkdtempSync(join(temp, 'omeumes-test-mu2-audit-'));
  directories.push(directory);
  return join(directory, 'fixture.sqlite');
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const resolved = realpathSync(directory);
    if (dirname(resolved) !== temp || !basename(resolved).startsWith('omeumes-test-mu2-audit-'))
      throw new Error('Diretório de teste inesperado.');
    rmSync(resolved, { recursive: true, force: true, maxRetries: 5 });
  }
});

// Build the previous financial schema directly. None of the new repository or
// migration code participates in preparing the balances we expect to recover.
function financialV4(path: string) {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 3000 });
  try {
    db.exec('PRAGMA journal_mode=WAL; BEGIN IMMEDIATE');
    for (const step of migrations.slice(0, 4)) db.exec(step);
    db.exec(`PRAGMA application_id=${APP_ID}; PRAGMA user_version=4`);
    const put = (table: string, ...values: SQLInputValue[]) =>
      db.prepare(`INSERT INTO ${table} VALUES(${values.map(() => '?').join(',')})`).run(...values);
    const accounts = [account, second].map((id) => ({ id, name: id, color: '#123456', restricted: false }));
    const category = { id: 'cat', name: 'Categoria de ensaio' };
    const savings = { id: reserve, name: 'Reserva de ensaio', accountId: account };
    const line = {
      id: 'compras',
      kind: 'expense',
      name: 'Compras de ensaio',
      accountId: account,
      categoryId: category.id,
      variable: true,
    };
    const savingLine = { ...line, id: 'reforco', kind: 'saving', reserveId: reserve };
    const reserveLine = { ...line, id: 'uso', reserveId: reserve };
    const reminder = {
      id: 'lembrete',
      name: 'Revisão de ensaio',
      date: '2028-11-02',
      frequency: 'monthly',
      active: true,
      accountId: account,
    };
    for (const a of accounts) {
      put('accounts', a.id, json(a));
      put('origins', 'a:' + a.id, a.id, null);
    }
    put('categories', category.id, json(category));
    put('reserves', reserve, account, json(savings));
    put('origins', pot, null, reserve);
    put('base_lines', line.id, account, category.id, null, 5100, json(line));
    put('recurring', reminder.id, account, null, 123, json(reminder));
    for (const [p, first, b, r] of [
      [period, 17000, 2000, 500],
      [following, 9600, 4400, null],
    ] as const) {
      put('months', p);
      put('initials', p, origin, first);
      put('initials', p, other, b);
      put('initials', p, pot, r);
      put('lines', p, line.id, 0, account, category.id, null, p === period ? 6200 : 5100, json(line));
      const occurrence = {
        id: reminder.id + ':' + p,
        definitionId: reminder.id,
        name: reminder.name,
        date: p + '-02',
        accountId: account,
        state: 'linked',
        lineId: line.id,
      };
      put('occurrences', p, occurrence.id, reminder.id, line.id, 123, json(occurrence));
    }
    put('lines', period, savingLine.id, 0, account, category.id, reserve, 1500, json(savingLine));
    put('lines', period, reserveLine.id, 0, account, category.id, reserve, 700, json(reserveLine));
    put('lines', period, 'retirada', 1, account, category.id, null, null, json({ ...line, id: 'retirada' }));
    put(
      'snapshots',
      period,
      1,
      json({
        date: period + '-01',
        lines: [{ ...line, plan: 5000 }],
        catalog: { accounts, categories: [category], reserves: [savings] },
      }),
    );
    function event(
      id: string,
      l: typeof line | null,
      type: string,
      amount: number,
      deltas: Record<string, number>,
      options: {
        voided?: boolean;
        corrects?: string;
        replacedBy?: string;
        purchase?: number;
      } = {},
    ) {
      put(
        'events',
        period,
        id,
        l?.id ?? null,
        amount,
        options.purchase ?? null,
        options.corrects ?? null,
        options.replacedBy ?? null,
        json({
          id,
          type,
          lineId: l?.id,
          line: l,
          date: period + '-04',
          note: id,
          voided: options.voided,
        }),
      );
      for (const [key, value] of Object.entries(deltas)) put('effects', period, id, key, value);
    }
    event('original', line, 'execution', 3500, { [origin]: -3500 }, { voided: true, replacedBy: 'correcao' });
    event('correcao', line, 'execution', 2500, { [origin]: -2500 }, { corrects: 'original' });
    event('total', line, 'total', 1000, { [origin]: -1000 });
    put('observations', period, 'total', null, 3500, 2500, 2500);
    event('detalhe', line, 'detail', 0, {}, { purchase: 200 });
    put('allocations', period, 'detalhe', 'total', 200);
    event('reforco-1', savingLine, 'execution', 1500, { [origin]: -1500, [pot]: 1500 });
    event('uso-1', reserveLine, 'execution', 700, { [pot]: -700 });
    event('transferencia', null, 'transfer', 2400, { [origin]: -2400, [other]: 2400 });
    put(
      'excel_imports',
      period,
      json({
        file: 'fixture.xlsx',
        sheet: 'fictícia',
        sha256: '0'.repeat(64),
        allocations: [{ name: 'Exemplo', amount: 12 }],
        cells: { A1: { value: '12', type: 'n' } },
      }),
    );
    put(
      'receipts',
      period,
      'original',
      '{"amount":3500,"complete":false,"date":"2028-11-04","lineId":"compras","source":"a:banco-a","type":"execute"}',
    );
    db.exec('UPDATE meta SET revision=17; COMMIT');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
}

function directoryState(path: string) {
  return readdirSync(join(path, '..'))
    .sort()
    .map((name) => ({
      name,
      digest: hash(readFileSync(join(path, '..', name))),
    }));
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return port;
}

it.skipIf(process.platform !== 'win32')(
  'AR04 recusa a v4 no verdadeiro Iniciar.cmd e no comando de migração antes de criar ficheiros',
  async () => {
    const path = temporaryPath();
    financialV4(path);
    const before = directoryState(path);
    const env = {
      ...process.env,
      OMEUMES_DB_PATH: path,
      OMEUMES_TEST_MODE: '1',
      OMEUMES_TEST_TRANSITION: '',
      OMEUMES_TEST_PORT: String(await freePort()),
    };
    for (const [executable, args] of [
      ['cmd.exe', ['/d', '/c', 'Iniciar.cmd']],
      [process.execPath, ['scripts/migrate.mjs']],
    ] as const) {
      const child = spawnSync(executable, args, {
        env,
        input: '\n',
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
      });
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stderr).toContain('por autorizar');
      expect(directoryState(path)).toEqual(before);
    }
  },
);

it('restaura um backup financeiro v4 em destino separado com todas as linhas originais', async () => {
  const path = temporaryPath();
  financialV4(path);
  const before = directoryState(path);
  const backup = await createBackup(path);
  const restored = join(path, '..', 'restauro.sqlite');
  await restoreBackup(backup.path, restored, path);
  expect(hash(readFileSync(restored))).toBe(hash(readFileSync(backup.path)));
  expect(hash(readFileSync(path))).toBe(before[0].digest);
  const original = new DatabaseSync(path, { readOnly: true });
  const copy = new DatabaseSync(restored, { readOnly: true });
  try {
    expect(copy.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
    for (const table of ['meta', ...financialTables]) {
      expect(copy.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).toEqual(
        original.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      );
    }
  } finally {
    original.close();
    copy.close();
  }
});

function privateDestination() {
  const path = temporaryPath();
  migrate(path, migrations.slice(0, 6), true);
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 3000 });
  try {
    db.exec('BEGIN IMMEDIATE');
    const people = ['primeira', 'destinataria'].map((name) => {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created) VALUES(?,?,?,?,1,?,?,?)',
      ).run(id, name, 'de ensaio', name + '@example.invalid', 'PT', 1, 1);
      createSpace(db, id, name, randomUUID());
      const spaceId = String(db.prepare('SELECT id FROM spaces WHERE owner_id=?').get(id)?.id);
      return { id, spaceId };
    });
    db.exec('COMMIT');
    return { path, first: people[0], selected: people[1] };
  } finally {
    db.close();
  }
}

function unchangedRecords(old: DatabaseSync, db: DatabaseSync, spaceId: string) {
  for (const table of financialTables) {
    const columns = old
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name)
      .join(',');
    const scopedTable = table === 'receipts' ? 'legacy_receipts' : table;
    const recovered = db
      .prepare(`SELECT ${columns} FROM ${scopedTable} WHERE space_id=? ORDER BY rowid`)
      .all(spaceId);
    expect(recovered, table).toEqual(old.prepare(`SELECT ${columns} FROM ${table} ORDER BY rowid`).all());
  }
}

function selectedBalances(db: DatabaseSync, spaceId?: string) {
  const scope = spaceId ? ' AND i.space_id=?' : '';
  const effectSpace = spaceId ? ' AND i.space_id=x.space_id AND x.space_id=e.space_id' : '';
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
  const activeLegacy = version < 7 ? "AND COALESCE(json_extract(e.payload,'$.voided'),0)=0" : '';
  return db
    .prepare(`SELECT i.source, i.amount + COALESCE((
    SELECT sum(x.delta) FROM effects x JOIN events e ON e.id=x.event_id AND e.period=x.period
    WHERE x.source=i.source AND x.period=i.period ${effectSpace}
      ${activeLegacy}
    ),0) AS balance FROM initials i WHERE i.period=? ${scope} ORDER BY i.source`)
    .all(period, ...(spaceId ? [spaceId] : []));
}

it('atribui toda a origem financeira unicamente ao destino explícito e recupera a mesma projeção após falha, replay, reabertura e restauro', async () => {
  const original = temporaryPath();
  financialV4(original);
  const source = (await createBackup(original)).path;
  const beforeBytes = hash(readFileSync(source));
  const { path, selected, first } = privateDestination();
  const attempt = (user = selected.id, space = selected.spaceId) => assignLegacy(source, path, user, space);
  expect(() => attempt(first.id)).toThrow();
  expect(() => attempt(selected.id, randomUUID())).toThrow();
  expect(() =>
    assignLegacy(source, path, selected.id, selected.spaceId, (table: string) => {
      if (table === 'effects') throw new Error('falha depois de copiar efeitos');
    }),
  ).toThrow('falha depois de copiar efeitos');
  const afterFailure = new DatabaseSync(path);
  try {
    for (const table of [...financialTables.filter((t) => t !== 'receipts'), 'legacy_receipts']) {
      expect(afterFailure.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n, table).toBe(0);
    }
  } finally {
    afterFailure.close();
  }
  const old = new DatabaseSync(source, { readOnly: true });
  const expected = [
    { source: origin, balance: 9600 },
    { source: other, balance: 4400 },
    { source: pot, balance: 1300 },
  ];
  try {
    expect(selectedBalances(old)).toEqual(expected);
    expect(attempt()).toEqual({ replay: false });
    let snapshotOfMigration: string | undefined;
    const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 3000 });
    try {
      unchangedRecords(old, db, selected.spaceId);
      snapshotOfMigration = json(db.prepare('SELECT * FROM events ORDER BY rowid').all());
      expect(selectedBalances(db, selected.spaceId)).toEqual(expected);
      expect(db.prepare('SELECT count(*) AS n FROM events WHERE author_id IS NOT NULL').get()?.n).toBe(0);
      expect(db.prepare('SELECT revision FROM meta WHERE space_id=?').get(selected.spaceId)?.revision).toBe(
        17,
      );
      expect(db.prepare('SELECT count(*) AS n FROM months WHERE space_id=?').get(first.spaceId)?.n).toBe(0);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
      expect(() =>
        db
          .prepare("UPDATE snapshots SET payload='{}' WHERE space_id=? AND period=?")
          .run(selected.spaceId, period),
      ).toThrow();
      expect(() =>
        db.prepare('DELETE FROM snapshots WHERE space_id=? AND period=?').run(selected.spaceId, period),
      ).toThrow(/immutable snapshot/);
      expect(() =>
        db
          .prepare('INSERT INTO snapshots(space_id,period,format,payload) VALUES(?,?,1,?)')
          .run(selected.spaceId, period, '{}'),
      ).toThrow(/immutable snapshot/);
    } finally {
      db.close();
    }
    expect(attempt()).toEqual({ replay: true });
    expect(() => attempt(first.id, first.spaceId)).toThrow();
    migrate(path, migrations.slice(0, 6));
    const backup = await createBackup(path);
    const copy = join(path, '..', 'restauro.sqlite');
    await restoreBackup(backup.path, copy, path);
    const recovered = new DatabaseSync(copy, { readOnly: true });
    try {
      expect(recovered.prepare('SELECT restored FROM identity_control WHERE id=1').get()?.restored).toBe(1);
      expect(recovered.prepare('PRAGMA user_version').get()?.user_version).toBe(6);
      unchangedRecords(old, recovered, selected.spaceId);
      expect(json(recovered.prepare('SELECT * FROM events ORDER BY rowid').all())).toBe(snapshotOfMigration);
      expect(selectedBalances(recovered, selected.spaceId)).toEqual(expected);
    } finally {
      recovered.close();
    }
  } finally {
    old.close();
  }
  expect(hash(readFileSync(source))).toBe(beforeBytes);
});

it('aceita o mesmo período em dois espaços e recusa FKs que apontem para contas, origens ou movimentos exclusivos de outro espaço', async () => {
  const original = temporaryPath();
  financialV4(original);
  const { path, selected, first } = privateDestination();
  assignLegacy((await createBackup(original)).path, path, selected.id, selected.spaceId);
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 3000 });
  try {
    const own = first.spaceId;
    db.prepare('INSERT INTO months(space_id,period) VALUES(?,?)').run(own, period);
    expect(db.prepare('SELECT count(*) AS n FROM months WHERE period=?').get(period)?.n).toBe(2);
    expect(() => db.prepare('INSERT INTO months(space_id,period) VALUES(?,?)').run(own, period)).toThrow(
      /UNIQUE/,
    );
    const a = { id: 'conta-exclusiva', name: 'Conta do primeiro', restricted: false, color: '#cccccc' };
    db.prepare('INSERT INTO accounts(space_id,id,payload) VALUES(?,?,?)').run(own, a.id, json(a));
    db.prepare('INSERT INTO origins(space_id,id,account_id,reserve_id) VALUES(?,?,?,NULL)').run(
      own,
      'a:' + a.id,
      a.id,
    );
    db.prepare('INSERT INTO initials(space_id,period,source,amount) VALUES(?,?,?,?)').run(
      own,
      period,
      'a:' + a.id,
      10000,
    );
    const sentinel = {
      id: 'movimento-exclusivo',
      type: 'transfer',
      date: period + '-05',
      note: 'histórico de teste',
    };
    db.prepare('INSERT INTO events(space_id,period,id,amount,payload) VALUES(?,?,?,?,?)').run(
      own,
      period,
      sentinel.id,
      0,
      json(sentinel),
    );
    for (const [sql, parameters] of [
      [
        "UPDATE reserves SET account_id=?,payload=json_set(payload,'$.accountId',?) WHERE space_id=?",
        [a.id, a.id, selected.spaceId],
      ],
      [
        "UPDATE lines SET account_id=?,payload=json_set(payload,'$.accountId',?) WHERE space_id=? AND id=?",
        [a.id, a.id, selected.spaceId, 'compras'],
      ],
      [
        "UPDATE recurring SET account_id=?,payload=json_set(payload,'$.accountId',?) WHERE space_id=?",
        [a.id, a.id, selected.spaceId],
      ],
      [
        'UPDATE initials SET source=? WHERE space_id=? AND source=? AND period=?',
        ['a:' + a.id, selected.spaceId, origin, following],
      ],
      ["UPDATE effects SET source=? WHERE space_id=? AND event_id='total'", ['a:' + a.id, selected.spaceId]],
      ['UPDATE allocations SET parent_id=? WHERE space_id=?', [sentinel.id, selected.spaceId]],
      ["UPDATE events SET corrects=? WHERE space_id=? AND id='correcao'", [sentinel.id, selected.spaceId]],
      [
        "UPDATE events SET payload=json_set(payload,'$.savingParentId',?) WHERE space_id=? AND id='correcao'",
        [sentinel.id, selected.spaceId],
      ],
      [
        "UPDATE occurrences SET payload=json_set(payload,'$.accountId',?) WHERE space_id=?",
        [a.id, selected.spaceId],
      ],
    ] as const)
      expect(() => db.prepare(sql).run(...parameters), sql).toThrow(/FOREIGN KEY constraint failed/i);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(() => db.prepare("UPDATE spaces SET currency='GBP' WHERE id=?").run(own)).toThrow();
    expect(() =>
      db.prepare('UPDATE memberships SET user_id=? WHERE space_id=?').run(selected.id, own),
    ).toThrow();
    expect(() => db.prepare('DELETE FROM memberships WHERE space_id=?').run(own)).toThrow();
  } finally {
    db.close();
  }
});

async function httpInstance(path: string, key = randomBytes(32).toString('base64')) {
  const port = await freePort();
  const url = 'http://127.0.0.1:' + port;
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      env: {
        ...process.env,
        OMEUMES_TEST_MODE: '1',
        OMEUMES_DB_PATH: path,
        OMEUMES_AUTH_KEY: key,
        OMEUMES_AUTH_ORIGIN: url,
        OMEUMES_MAIL_TRANSPORT: 'test',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  const ended = new Promise<void>((resolve, reject) => {
    child.once('close', () => resolve());
    child.once('error', reject);
  });
  const stop = async () => {
    child.kill();
    await ended;
  };
  const request = (endpoint: string, data?: object, cookie = '', id = '') =>
    fetch(url + endpoint, {
      method: data ? 'POST' : 'GET',
      headers: { origin: url, cookie, 'x-account': id, 'content-type': 'application/json' },
      body: data ? json(data) : undefined,
    });
  for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt++) {
    if ((await request('/api/identity').catch(() => null))?.ok) return { stop, request, url, key };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await stop();
  throw new Error('Instância de teste indisponível.');
}

it('dois titulares usam o mesmo período e só leem ou confirmam recursos próprios na API', async () => {
  const path = temporaryPath();
  migrate(path, undefined, true);
  const api = await httpInstance(path);
  try {
    const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 3000 });
    try {
      async function login(name: string) {
        const email = name + '@example.invalid';
        const password = randomBytes(24).toString('base64url');
        const registration = await api.request('/api/identity', {
          action: 'register',
          firstName: name,
          lastName: 'de ensaio',
          email,
          password,
          country: 'PT',
          terms: 'dev-2',
          adult: true,
        });
        expect(registration.status).toBe(200);
        let token = '';
        const config = settings({ OMEUMES_AUTH_KEY: api.key, OMEUMES_AUTH_ORIGIN: api.url });
        while (
          await dispatchOne(path, config, async (job, _config, message) => {
            if (job.kind === 'verify' && message.to === email) {
              token = new URL(message.text.match(/http[^\s]+/)![0]).hash.slice('#verify='.length);
            }
            return { status: 'delivered' };
          })
        ) {}
        expect(token).not.toBe('');
        expect((await api.request('/api/identity', { action: 'verify', password, token })).status).toBe(200);
        const session = await api.request('/api/identity', { action: 'login', email, password });
        expect(session.status).toBe(200);
        const cookie = session.headers.getSetCookie()[0].split(';')[0];
        const accountId = (await (await api.request('/api/identity', undefined, cookie)).json()).account.id;
        const request = (endpoint: string, data?: object) => api.request(endpoint, data, cookie, accountId);
        expect(await (await request('/api/spaces')).json()).toEqual({ spaces: [] });
        const intention = { name, requestId: randomUUID() };
        const first = await request('/api/spaces', intention);
        expect(first.status).toBe(200);
        const { space } = await first.json();
        expect(space).toMatchObject({ name, currency: 'EUR' });
        expect((await (await request('/api/spaces', intention)).json()).space.id).toBe(space.id);
        expect((await (await request('/api/spaces')).json()).spaces).toHaveLength(1);
        const empty = await (await request('/api/state?spaceId=' + space.id)).json();
        expect(empty.state.months).toEqual({});
        expect(empty.state.accounts).toEqual([]);
        return { space: space.id, request, accountId, cookie };
      }
      const a = await login('alice');
      const b = await login('bruno');
      expect((await a.request('/api/identity',{action:'interfaceLocale',locale:'pt-PT'})).status).toBe(200);
      expect((await a.request('/api/identity',{action:'interfaceLocale',locale:'en-US'})).status).toBe(422);
      expect((await a.request('/api/spaces',{name:'Inválido',currency:'USD',requestId:randomUUID()})).status).toBe(422);
      expect((await (await a.request('/api/identity')).json()).account).toMatchObject({
        country:'PT',interfaceLocale:'pt-PT',communicationLocale:'pt-PT'
      });
      const source = temporaryPath();
      financialV4(source);
      assignLegacy((await createBackup(source)).path, path, a.accountId, a.space);
      const open = { period, revision: 0, requestId: randomUUID(), action: { type: 'month', period } };
      const creation = await b.request('/api/state?spaceId=' + b.space, open);
      expect(creation.status, await creation.clone().text()).toBe(200);
      expect((await (await b.request('/api/state?spaceId=' + b.space, open)).json()).replay).toBe(true);
      const read = (space: string) => `/api/state?spaceId=${space}&period=${period}`;
      const receipt = (space: string, key: string) => `/api/requests?spaceId=${space}&requestId=${key}`;
      const ownRead = await a.request(read(a.space));
      expect(ownRead.status, await ownRead.clone().text()).toBe(200);
      expect(ownRead.headers.get('cache-control')).toContain('no-store');
      const dto = await ownRead.json();
      expect(Object.keys(dto.state.months)).toEqual([period]);
      expect(dto.state.months[period].events).toHaveLength(8);
      expect(dto.state.requests ?? {}).toEqual({});
      const history=(space:string,ids:string[])=>'/api/history?'+new URLSearchParams([
        ['spaceId',space],['period',period],...ids.map(id=>['eventId',id])
      ]);
      expect(dto.state.months[period].events[0].note).toBe('');
      expect((await (await a.request(history(a.space,['original']))).json()).entries)
        .toEqual([{id:'original',note:'original',author:null,createdAt:null}]);
      expect((await a.request(history(a.space,Array(21).fill('original')))).status).toBe(422);
      expect((await b.request(history(a.space,['original']))).status).toBe(403);
      expect((await (await b.request(history(b.space,['original']))).json()).entries).toEqual([]);
      const legacyCommand = {
        period,
        revision: 0,
        requestId: 'original',
        action: {
          amount: 3500,
          complete: false,
          date: period + '-04',
          lineId: 'compras',
          source: origin,
          type: 'execute',
        },
      };
      const legacyReplay = await a.request(read(a.space), legacyCommand);
      expect(legacyReplay.status, await legacyReplay.clone().text()).toBe(200);
      expect((await legacyReplay.json()).replay).toBe(true);
      expect((await (await a.request(receipt(a.space, 'original'))).json()).request).toEqual({
        requestId: 'original',
        period,
        status: 'confirmed',
      });
      expect((await (await b.request(receipt(b.space, 'original'))).json()).request).toBe(null);
      const bRead = await b.request(read(b.space));
      expect(bRead.status).toBe(200);
      const bDto = await bRead.json();
      expect(bDto.state.months[period].events).toEqual([]);
      expect(bDto.state.accounts).toEqual([]);
      const myCommand = {
        period,
        revision: dto.revision,
        requestId: randomUUID(),
        action: { type: 'initial', source: origin, amount: 84 },
      };
      for (const response of [
        await b.request(read(a.space)),
        await b.request(read(a.space), myCommand),
        await b.request(receipt(a.space, 'original')),
        await b.request(receipt(a.space, 'original'), {
          operation: 'resolve',
          requestId: 'original',
          period,
        }),
        await b.request('/api/local-files?action=backup', {}),
        await b.request('/api/local-files?action=export&spaceId=' + a.space, {}),
      ]) {
        expect([401, 403, 404], await response.clone().text()).toContain(response.status);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(await response.text()).not.toMatch(/banco-a|Compras de ensaio|fixture\.xlsx|\.sqlite|2028-11/);
      }
      const key = myCommand.requestId;
      const crossFunds = {
        period,
        revision: bDto.revision,
        requestId: key,
        action: { type: 'initial', source: origin, amount: 84 },
      };
      const refused = await b.request(read(b.space), crossFunds);
      expect(refused.status, await refused.clone().text()).toBe(422);
      expect((await (await b.request(read(b.space))).json()).state.months[period].initials).toEqual({});
      expect(db.prepare('SELECT count(*) AS n FROM events WHERE space_id=?').get(a.space)?.n).toBe(8);

      const january = '2029-01';
      const endpoint = '/api/state?spaceId=' + a.space;
      const create = {
        requestId: randomUUID(),
        period: following,
        revision: dto.revision,
        action: { type: 'month', period: january },
      };
      const parallel = await httpInstance(path, api.key);
      try {
        const responses = await Promise.all([
          a.request(endpoint, create),
          parallel.request(endpoint, { ...create, requestId: randomUUID() }, a.cookie, a.accountId),
        ]);
        for (const response of responses) expect(response.status, await response.clone().text()).toBe(200);
        const januaryState = (await (await a.request(endpoint + '&period=' + january)).json()).state.months[
          january
        ];
        expect(januaryState.events).toEqual([]);
        expect(januaryState.initials).toEqual({ [origin]: 9600, [other]: 4400, [pot]: null });
        expect(januaryState.lines.map((row: { id: string; plan: number }) => [row.id, row.plan])).toEqual([
          ['compras', 5100],
        ]);
        expect(januaryState.occurrences.map((row: { id: string }) => row.id)).toEqual(['lembrete:2029-01']);
        expect(
          db.prepare('SELECT count(*) AS n FROM months WHERE space_id=? AND period=?').get(a.space, january)
            ?.n,
        ).toBe(1);
      } finally {
        await parallel.stop();
      }

      const command = {
        period,
        revision: dto.revision + 1,
        requestId: 'falha-tardia',
        action: { type: 'transfer', source: origin, destination: other, date: period + '-10', amount: 400 },
      };
      db.exec(`CREATE TRIGGER fail_test_receipt BEFORE INSERT ON receipts
        WHEN NEW.request_id='falha-tardia' BEGIN SELECT RAISE(ABORT,'falha de ensaio'); END`);
      try {
        expect((await a.request(endpoint, command)).status).toBe(503);
        expect(db.prepare('SELECT count(*) AS n FROM events WHERE space_id=?').get(a.space)?.n).toBe(8);
        expect(
          db
            .prepare('SELECT count(*) AS n FROM effects WHERE space_id=? AND event_id=?')
            .get(a.space, command.requestId)?.n,
        ).toBe(0);
        expect((await (await a.request(receipt(a.space, command.requestId))).json()).request).toBe(null);
      } finally {
        db.exec('DROP TRIGGER fail_test_receipt');
      }
      const resolved = await a.request('/api/requests?spaceId=' + a.space, {
        operation: 'resolve',
        period,
        requestId: command.requestId,
      });
      expect((await resolved.json()).request.status).toBe('closed');
      expect((await a.request(endpoint, command)).status).toBe(422);
      const newTransfer = { ...command, requestId: 'transferencia-confirmada' };
      expect((await a.request(endpoint, newTransfer)).status).toBe(200);
      expect((await (await a.request(endpoint, newTransfer)).json()).replay).toBe(true);
      expect(
        db
          .prepare('SELECT author_id FROM events WHERE space_id=? AND id=?')
          .get(a.space, newTransfer.requestId)?.author_id,
      ).toBe(a.accountId);
      expect(selectedBalances(db, a.space)).toEqual([
        { source: origin, balance: 9200 },
        { source: other, balance: 4800 },
        { source: pot, balance: 1300 },
      ]);
      expect(
        (await (await a.request(endpoint + '&period=' + following)).json()).state.months[following].initials[
          origin
        ],
      ).toBe(9600);
      // Simulate the address being released; actual account closure belongs to MU5.
      db.prepare('UPDATE users SET email=? WHERE id=?').run('retirada@example.invalid',a.accountId);
      const fresh=await login('alice');
      expect(fresh.accountId).not.toBe(a.accountId);
      expect((await fresh.request(read(a.space))).status).toBe(403);
      expect((await fresh.request(receipt(a.space,'original'))).status).toBe(403);
    } finally {
      db.close();
    }
  } finally {
    await api.stop();
  }
});
