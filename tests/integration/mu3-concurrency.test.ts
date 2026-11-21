import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { hashSync } from '@node-rs/argon2';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Command, Confirmed } from '../../src/modules/finance/contracts/command';
import type { Action, Execution } from '../../src/modules/finance/domain/actions';
import { balance, realized } from '../../src/modules/finance/domain/projections';
import { digest } from '../../src/modules/identity/secrets.mjs';
import { migrate } from '../../src/server/storage.mjs';

const period = '2028-11';
const date = period + '-04';
const bank = 'a:checking';
const reserve = 'r:holidays';
const root = realpathSync(tmpdir());
const key = randomBytes(32).toString('base64');
let directory: string;
let db: DatabaseSync;
let processes: Awaited<ReturnType<typeof start>>[] = [];

type Person = { id: string; cookie: string; email: string };
let ana: Person;
let bruno: Person;
let carla: Person;

async function start(path: string) {
  const probe = createServer();
  await new Promise<void>((done, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', done);
  });
  const { port } = probe.address() as { port: number };
  await new Promise<void>((done, reject) => probe.close((error) => (error ? reject(error) : done())));
  const url = 'http://127.0.0.1:' + port;
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      env: {
        ...process.env,
        OMEUMES_AUTH_ORIGIN: url,
        OMEUMES_AUTH_KEY: key,
        OMEUMES_DB_PATH: path,
        OMEUMES_TEST_MODE: '1',
        OMEUMES_TEST_TRANSITION: 'MU5',
        OMEUMES_MAIL_TRANSPORT: 'test',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let diagnostics = '';
  child.stderr.on('data', (data) => {
    diagnostics += data;
  });
  child.stdout.on('data', (data) => {
    diagnostics += data;
  });
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
  async function stop() {
    child.kill();
    await closed;
  }
  for (let i = 0; i < 150 && child.exitCode === null; i++) {
    if ((await fetch(url + '/api/identity', { signal: AbortSignal.timeout(500) }).catch(() => null))?.ok)
      return {
        pid: child.pid,
        stop,
        request: (person: Person, endpoint: string, data?: object) =>
          fetch(url + endpoint, {
            method: data ? 'POST' : 'GET',
            headers: {
              Origin: url,
              Cookie: 'omeumes-session=' + person.cookie,
              'X-Account': person.id,
              'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
            signal: AbortSignal.timeout(10_000),
          }),
      };
    await delay(100);
  }
  await stop();
  throw new Error('Instância MU3 de teste indisponível. ' + diagnostics);
}

function person(name: string): Person {
  const id = randomUUID();
  const cookie = randomBytes(32).toString('base64url');
  const now = Date.now();
  const email = name.toLowerCase() + '@example.invalid';
  db.prepare(`INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created)
    VALUES(?,?,?, ?,1,'PT',?,?)`).run(id, name, 'Sintética', email, now, now);
  db.prepare(`INSERT INTO sessions(id,digest,user_id,scope,created,active,expires,remembered,authenticated)
    VALUES(?,?,?,'account',?,?,?,0,?)`).run(randomUUID(), digest(cookie), id, now, now, now + 3_600_000, now);
  return { id, cookie, email };
}

beforeAll(async () => {
  directory = mkdtempSync(join(root, 'omeumes-test-mu3-race-'));
  const path = join(directory, 'fixture.sqlite');
  migrate(path, undefined, true);
  db = new DatabaseSync(path, { timeout: 3000, enableForeignKeyConstraints: true });
  ana = person('Ana');
  bruno = person('Bruno');
  carla = person('Carla');
  processes.push(await start(path));
  processes.push(await start(path));
  expect(processes[0].pid).not.toEqual(processes[1].pid);
});

afterAll(async () => {
  await Promise.all(processes.map((child) => child.stop()));
  processes = [];
  db?.close();
  if (
    directory &&
    dirname(realpathSync(directory)) === root &&
    basename(directory).startsWith('omeumes-test-mu3-race-')
  )
    rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
});

async function ok<T>(response: Response): Promise<T> {
  expect(response.ok, await response.clone().text()).toBe(true);
  return response.json() as Promise<T>;
}

async function problem(response: Response, code: string, status = 409) {
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(status);
  expect(body.code).toBe(code);
  return body;
}

function command(revision: number, action: Action, requestId: string = randomUUID()): Command {
  return { period, revision, action, requestId };
}

function purchase(lineId: string, amount: number, description?: string): Execution {
  return { type: 'execute', lineId, amount, date, source: bank, complete: false, description };
}

function expense(id: string, variable: boolean, plan = 10000) {
  return {
    id,
    name: id,
    kind: 'expense',
    accountId: 'checking',
    categoryId: 'shopping',
    variable,
    plan,
  } as const;
}

async function fixture(name: string, members: Person[] = [bruno]) {
  const { space } = await ok<{ space: { id: string } }>(
    await processes[0].request(ana, '/api/spaces', { name, requestId: randomUUID() }),
  );
  for (const member of members)
    db.prepare("INSERT INTO memberships(space_id,user_id,role) VALUES(?,?,'editor')").run(
      space.id,
      member.id,
    );
  const scope = '?spaceId=' + space.id;
  const state = '/api/state' + scope;
  const actor = (server: number, person: Person) => ({
    send: (request: Command) => processes[server].request(person, state, request),
    read: () => processes[server].request(person, state + '&period=' + period).then(ok<Confirmed>),
    reference: (requestId: string) =>
      processes[server].request(
        person,
        '/api/requests' + scope + '&requestId=' + encodeURIComponent(requestId) + '&period=' + period,
      ),
    change: (operation: 'prepare' | 'resolve' | 'ack', requestId: string) =>
      processes[server].request(person, '/api/requests' + scope, { operation, requestId, period }),
    history: (query = '') =>
      processes[server].request(person, '/api/history' + scope + '&period=' + period + query),
  });
  const a = actor(0, ana);
  const b = actor(1, bruno);
  const c = actor(0, carla);
  let revision = 0;
  const actions: Action[] = [
    { type: 'month', period },
    {
      type: 'account',
      account: { id: 'checking', name: 'Conta de ensaio', restricted: false, color: '#123456' },
    },
    { type: 'category', category: { id: 'shopping', name: 'Compras de ensaio' } },
    { type: 'reserve', reserve: { id: 'holidays', accountId: 'checking', name: 'Reserva de ensaio' } },
    { type: 'initial', source: bank, amount: 30000 },
    { type: 'initial', source: reserve, amount: 5000 },
  ];
  for (const action of actions) ({ revision } = await ok<Confirmed>(await a.send(command(revision, action))));
  const setup = async (...lines: ReturnType<typeof expense>[]) => {
    for (const line of lines)
      ({ revision } = await ok<Confirmed>(await a.send(command(revision, { type: 'line', line }))));
    return revision;
  };
  const event = (id: string) =>
    db
      .prepare('SELECT id,author_id,amount,payload FROM events WHERE space_id=? AND period=? AND id=?')
      .get(space.id, period, id);
  const countEvents = () =>
    db.prepare('SELECT count(*) AS n FROM events WHERE space_id=? AND period=?').get(space.id, period)?.n;
  return { a, b, c, actor, spaceId: space.id, setup, event, countEvents };
}

it('MU6 mede leituras e compras concorrentes com duas instâncias e verifica o saldo final', async () => {
  const f = await fixture('Medição de carga');
  const revision = await f.setup(expense('compras', true));
  for (const scenario of ['leituras', 'compras'] as const) {
    const durations: number[] = [];
    const started = performance.now();
    for (let batch = 0; batch < 8; batch++) {
      await Promise.all(
        Array.from({ length: 8 }, async (_, i) => {
          const actor = i % 2 ? f.a : f.b;
          const before = performance.now();
          if (scenario === 'leituras') await actor.read();
          else await ok(await actor.send(command(revision, purchase('compras', 1 + 8 * batch + i))));
          durations.push(performance.now() - before);
        }),
      );
    }
    const elapsed = performance.now() - started;
    durations.sort((a, b) => a - b);
    console.info(
      'MU6',
      scenario,
      JSON.stringify({
        requests: durations.length,
        concurrent: 8,
        elapsedMs: Math.round(elapsed),
        p50Ms: Math.round(durations[31]),
        p95Ms: Math.round(durations[60]),
        perSecond: Math.round(64000 / elapsed),
      }),
    );
  }
  const state = (await f.a.read()).state.months[period];
  expect([f.countEvents(), realized(state, 'compras'), balance(state, bank)]).toEqual([64, 2080, 27920]);
});

it('MU6 a consulta de encerramento omite o espaço vencido antes da próxima limpeza', async () => {
  const f = await fixture('Espaço com prazo');
  const list = () => processes[0].request(ana, '/api/closure').then(ok<{ spaces: { id: string }[] }>);
  expect((await list()).spaces.some((s) => s.id === f.spaceId)).toBe(true);
  db.prepare('UPDATE spaces SET delete_due=? WHERE id=?').run(Date.UTC(2020, 0, 1), f.spaceId);
  expect((await list()).spaces.some((s) => s.id === f.spaceId)).toBe(false);
  const creation = db.prepare('SELECT request_id FROM space_creations WHERE space_id=?').get(f.spaceId)!;
  await problem(
    await processes[1].request(ana, '/api/spaces', {
      name: 'Espaço com prazo',
      requestId: creation.request_id,
    }),
    'IDEMPOTENCY',
  );
});

it('A14/A36: duas pessoas registam compras distintas e a intenção igual requer contexto atual', async () => {
  const f = await fixture('Concorrência de compras', [bruno, carla]);
  const revision = await f.setup(expense('alimentacao', true), expense('outros', true));
  const unrelated = await fixture('Espaço independente', []);
  const otherRevision = await unrelated.setup(expense('alimentacao', true));
  const coffee = command(revision, purchase('alimentacao', 500, 'Café'));
  const shopping = command(revision, purchase('alimentacao', 3000, 'Supermercado'));
  await Promise.all([
    f.a.send(coffee).then(ok<Confirmed>),
    f.b.send(shopping).then(ok<Confirmed>),
    unrelated.a.send(command(otherRevision, purchase('alimentacao', 900, 'Outro espaço'))).then(ok),
  ]);
  const first = await f.a.read();
  expect(realized(first.state.months[period], 'alimentacao')).toBe(3500);
  expect(balance(first.state.months[period], bank)).toBe(26500);
  expect(f.event(coffee.requestId)?.author_id).toBe(ana.id);
  expect(f.event(shopping.requestId)?.author_id).toBe(bruno.id);

  const initial = command(first.revision, purchase('alimentacao', 1000, 'Marmita da Ana'));
  await ok(await f.a.send(initial));
  const candidate = command(first.revision, purchase('alimentacao', 1000, 'Marmita do Bruno'));
  const warned = await problem(await f.b.send(candidate), 'DUPLICATE');
  expect(warned.duplicate).toMatchObject({
    token: expect.stringMatching(/^[a-f0-9]{64}$/),
    entries: [expect.objectContaining({ amount: 1000, date, description: 'Marmita da Ana' })],
  });
  expect(f.countEvents()).toBe(3);
  const fresh = await f.c.read();
  await ok(await f.c.send(command(fresh.revision, purchase('alimentacao', 701, 'Compra entretanto'))));
  const stale = await f.b.send({
    ...candidate,
    requestId: randomUUID(),
    duplicateConfirmation: warned.duplicate.token,
  });
  const secondWarning = await problem(stale, 'DUPLICATE');
  expect(secondWarning.duplicate.token).not.toBe(warned.duplicate.token);
  expect(f.countEvents()).toBe(4);

  const sameAmountDifferentDetails = {
    ...candidate,
    requestId: randomUUID(),
    action: purchase('alimentacao', 1000, 'Montante igual, intenção alterada'),
    duplicateConfirmation: secondWarning.duplicate.token,
  };
  await problem(await f.b.send(sameAmountDifferentDetails), 'DUPLICATE');
  expect(f.countEvents()).toBe(4);
  const deliberate = {
    ...candidate,
    requestId: randomUUID(),
    duplicateConfirmation: secondWarning.duplicate.token,
  };
  const settled = await Promise.all([
    f
      .actor(0, bruno)
      .send(deliberate)
      .then(ok<Confirmed>),
    f.b.send(deliberate).then(ok<Confirmed>),
  ]);
  expect(settled.map((result) => result.replay).sort()).toEqual([false, true]);
  expect(f.countEvents()).toBe(5);
  const final = await f.a.read();
  expect(realized(final.state.months[period], 'alimentacao')).toBe(6201);
  expect(balance(final.state.months[period], bank)).toBe(23799);
  expect(f.event(deliberate.requestId)?.author_id).toBe(bruno.id);
});

it('A10: restantes simultâneos não duplicam e parcelas diferentes perfazem a obrigação', async () => {
  const f = await fixture('Obrigações em concorrência');
  const revision = await f.setup(
    expense('integral', false),
    expense('parcial', false),
    expense('restante', false),
    expense('limite', false, 3000),
  );
  const full = { ...purchase('integral', 10000), complete: true, remaining: true };
  const integral = await Promise.all([f.a.send(command(revision, full)), f.b.send(command(revision, full))]);
  expect(integral.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(f.countEvents()).toBe(1);

  const beforePartials = await f.b.read();
  const parcels = await Promise.all([
    f.a.send(command(beforePartials.revision, purchase('parcial', 4000))).then(ok<Confirmed>),
    f.b.send(command(beforePartials.revision, purchase('parcial', 6000))).then(ok<Confirmed>),
  ]);
  expect(parcels).toHaveLength(2);
  const beforeRemaining = await f.a.read();
  await ok(await f.a.send(command(beforeRemaining.revision, purchase('restante', 4000))));
  const reviewed = await f.b.read();
  await ok(await f.a.send(command(reviewed.revision, purchase('restante', 1000))));
  const stale = await f.b.send(
    command(reviewed.revision, {
      ...purchase('restante', 6000),
      complete: true,
      remaining: true,
    }),
  );
  await problem(stale, 'CONFLICT');
  const final = await f.a.read();
  expect(realized(final.state.months[period], 'integral')).toBe(10000);
  expect(realized(final.state.months[period], 'parcial')).toBe(10000);
  expect(realized(final.state.months[period], 'restante')).toBe(5000);
  expect(balance(final.state.months[period], bank)).toBe(5000);
  const overlapping = await Promise.all([
    f.a.send(command(final.revision, purchase('limite', 2100))),
    f.b.send(command(final.revision, purchase('limite', 1200))),
  ]);
  expect(overlapping.map((response) => response.status).sort()).toEqual([200, 409]);
  const amount = overlapping[0].ok ? 2100 : 1200;
  const afterOverlap = (await f.a.read()).state.months[period];
  expect(realized(afterOverlap, 'limite')).toBe(amount);
  expect(balance(afterOverlap, bank)).toBe(5000 - amount);
});

it('total manual visto antes da compra exige releitura e inclui a compra uma única vez', async () => {
  const f = await fixture('Total manual e compra');
  const revision = await f.setup(expense('mercado', true));
  await ok(await f.a.send(command(revision, purchase('mercado', 3000, 'Compra anotada'))));
  const total = { ...purchase('mercado', 5000), total: true };
  await problem(await f.b.send(command(revision, total)), 'CONFLICT');
  expect(f.countEvents()).toBe(1);
  const reviewed = await f.b.read();
  const committed = await ok<Confirmed>(await f.b.send(command(reviewed.revision, total)));
  expect(f.countEvents()).toBe(2);
  expect(realized(committed.state.months[period], 'mercado')).toBe(5000);
  expect(balance(committed.state.months[period], bank)).toBe(25000);
  expect(committed.state.months[period].events.map((entry) => [entry.type, entry.amount])).toEqual([
    ['execution', 3000],
    ['total', 2000],
  ]);
  await problem(await f.a.send(command(reviewed.revision, purchase('mercado', 700))), 'CONFLICT');
  expect(f.countEvents()).toBe(2);
});

it('A12/A13: processos concorrentes guardam uma referência e abrem um único mês', async () => {
  const f = await fixture('Referência do plano');
  let revision = await f.setup(expense('seguro', false, 7000));
  const base = command(revision, { type: 'line', target: 'base', line: expense('plano-anual', false, 4000) });
  ({ revision } = await ok<Confirmed>(await f.a.send(base)));
  ({ revision } = await ok<Confirmed>(
    await f.a.send(
      command(revision, {
        type: 'recurring',
        definition: {
          id: 'aviso',
          name: 'Aviso sintético',
          date,
          active: true,
          frequency: 'monthly',
          accountId: 'checking',
          amount: 100,
        },
      }),
    ),
  ));
  const snapshots = await Promise.all([
    f.a.send(command(revision, { type: 'snapshot', date })).then(ok<Confirmed>),
    f.b.send(command(revision, { type: 'snapshot', date: period + '-05' })).then(ok<Confirmed>),
  ]);
  expect(snapshots.map((response) => response.replay).sort()).toEqual([false, true]);
  expect(db.prepare('SELECT count(*) AS n FROM snapshots WHERE space_id=?').get(f.spaceId)?.n).toBe(1);
  const snapshot = (await f.a.read()).state.months[period].snapshot;
  expect(snapshot?.date).toBe(snapshots[0].replay ? period + '-05' : date);
  expect(snapshots.map((result) => result.state.months[period].snapshot)).toEqual([snapshot, snapshot]);
  expect(snapshot?.lines.find((line) => line.id === 'seguro')?.plan).toBe(7000);

  const latest = await f.a.read();
  await ok(await f.a.send(command(latest.revision, purchase('seguro', 1500))));
  const ready = await f.a.read();
  expect(ready.state.months[period].snapshot).toEqual(snapshot);
  const nextPeriod = '2028-12';
  const newMonth = { type: 'month', period: nextPeriod } as const;
  const openings = await Promise.all([
    f.a.send(command(ready.revision, newMonth)).then(ok<Confirmed>),
    f.b.send(command(ready.revision, newMonth)).then(ok<Confirmed>),
  ]);
  for (const result of openings) {
    const month = result.state.months[nextPeriod];
    expect(month.lines.map((line) => [line.id, line.plan])).toEqual([['plano-anual', 4000]]);
    expect(month.occurrences.map((occurrence) => occurrence.id)).toEqual(['aviso:' + nextPeriod]);
    expect(month.initials[bank]).toBe(28500);
    expect(month.events).toEqual([]);
  }
  expect(
    db.prepare('SELECT count(*) AS n FROM months WHERE space_id=? AND period=?').get(f.spaceId, nextPeriod)
      ?.n,
  ).toBe(1);
});

it('A11/A30/A44: recibo recupera resposta perdida e fecho terminal impede chegada tardia', async () => {
  const f = await fixture('Recibos e chegada tardia');
  const revision = await f.setup(expense('testes', true));
  const saved = command(revision, purchase('testes', 1200, 'Compra com resposta perdida'));
  const lost = await f.b.send(saved);
  expect(lost.status).toBe(200);
  await lost.body?.cancel();
  const confirmed = await ok<{ request: { status: string } }>(await f.b.reference(saved.requestId));
  expect(confirmed.request.status).toBe('confirmed');
  expect(confirmed.request).not.toHaveProperty('amount');
  expect(confirmed.request).not.toHaveProperty('description');
  const stored = db
    .prepare(
      'SELECT fingerprint,version,result_revision,result_id FROM receipts WHERE space_id=? AND user_id=? AND request_id=?',
    )
    .get(f.spaceId, bruno.id, saved.requestId);
  expect(stored).toMatchObject({
    fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    version: 2,
    result_revision: revision + 1,
    result_id: saved.requestId,
  });
  const sameActorDifferentProcess = f.actor(0, bruno);
  expect((await ok<Confirmed>(await sameActorDifferentProcess.send(saved))).replay).toBe(true);
  await problem(
    await sameActorDifferentProcess.send({ ...saved, action: purchase('testes', 1300) }),
    'IDEMPOTENCY',
    422,
  );
  expect(await ok(await f.a.reference(saved.requestId))).toEqual({ request: null });
  await ok(await f.b.change('ack', saved.requestId));
  // Simulate an old acknowledged receipt without waiting out the policy interval.
  db.prepare(`UPDATE receipts SET AddedAt='2002-01-01T00:00:00.000Z',ModifiedAt='2002-01-01T00:00:00.000Z'
    WHERE space_id=? AND user_id=? AND request_id=?`).run(f.spaceId, bruno.id, saved.requestId);
  expect((await ok<Confirmed>(await f.b.send(saved))).replay).toBe(true);

  const neverReceived = command((await f.b.read()).revision, purchase('testes', 1700, 'Pedido em trânsito'));
  expect(await ok(await f.b.reference(neverReceived.requestId))).toEqual({ request: null });
  const closed = await ok<{ request: { status: string } }>(
    await sameActorDifferentProcess.change('resolve', neverReceived.requestId),
  );
  expect(closed.request.status).toBe('closed');
  const replacement = { ...neverReceived, requestId: randomUUID() };
  await ok(await sameActorDifferentProcess.send(replacement));
  await problem(await f.b.send(neverReceived), 'IDEMPOTENCY', 422);
  const final = await f.a.read();
  expect(f.countEvents()).toBe(2);
  expect(f.event(neverReceived.requestId)).toBeUndefined();
  expect(realized(final.state.months[period], 'testes')).toBe(2900);
  expect(balance(final.state.months[period], bank)).toBe(27100);
});

it('A07/A31: uma escrita antes da revogação permanece e a escrita seguinte revalida dentro do bloqueio', async () => {
  const f = await fixture('Revogação ordenada');
  const revision = await f.setup(expense('fornecimentos', true));
  const first = command(revision, purchase('fornecimentos', 1000, 'Antes de revogar'));
  await ok(await f.b.send(first));
  const later = command((await f.b.read()).revision, purchase('fornecimentos', 2500, 'Depois de revogar'));
  await ok(await f.b.change('prepare', later.requestId));
  db.exec('BEGIN IMMEDIATE');
  const queued = f.b.send(later);
  try {
    // Another process has issued a POST while the revoking transaction owns the writer lock.
    expect(await Promise.race([queued.then(() => true), delay(100, false)])).toBe(false);
    const now = new Date().toISOString();
    expect(
      db
        .prepare(`UPDATE memberships SET IsDeleted=1,DeletedAt=?,ModifiedAt=?
      WHERE space_id=? AND user_id=?`)
        .run(now, now, f.spaceId, bruno.id).changes,
    ).toBe(1);
    db.exec('COMMIT');
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
  }
  for (const response of [await queued, await f.b.reference(first.requestId), await f.b.send(first)]) {
    const body = await problem(response, 'SPACE_ACCESS', 403);
    expect(body).not.toHaveProperty('state');
    expect(body).not.toHaveProperty('request');
  }
  const final = await f.a.read();
  expect(f.countEvents()).toBe(1);
  expect(f.event(first.requestId)?.author_id).toBe(bruno.id);
  expect(f.event(later.requestId)).toBeUndefined();
  expect(balance(final.state.months[period], bank)).toBe(29000);
});

it('A28: reversão e correção de uma despesa de poupança conservam o histórico e o efeito líquido', async () => {
  const f = await fixture('Histórico compensatório');
  const revision = await f.setup(expense('ferias', true), expense('compras', true));
  const debit = { ...purchase('ferias', 2000), source: reserve };
  const first = command(revision, debit);
  await ok(await f.b.send(first));
  const selected = await f.a.read();
  expect(balance(selected.state.months[period], reserve)).toBe(3000);
  const reversals = await Promise.all([
    f.a.send(command(selected.revision, { type: 'void', id: first.requestId })),
    f.b.send(command(selected.revision, { type: 'void', id: first.requestId })),
  ]);
  expect(reversals.filter((response) => response.ok)).toHaveLength(1);
  expect(f.countEvents()).toBe(2);
  expect(f.event(first.requestId)).toMatchObject({ amount: 2000, author_id: bruno.id });
  const reversed = await f.a.read();
  expect(balance(reversed.state.months[period], reserve)).toBe(5000);
  expect(realized(reversed.state.months[period], 'ferias')).toBe(0);

  const corrected = command(reversed.revision, { ...debit, lineId: 'compras' });
  await ok(await f.b.send(corrected));
  const prior = await f.a.read();
  const correction = command(prior.revision, {
    type: 'correct',
    id: corrected.requestId,
    replacement: {
      ...debit,
      lineId: 'compras',
      amount: 1500,
      date: period + '-15',
    },
  });
  await ok(await f.a.send(correction));
  const final = await f.b.read();
  const month = final.state.months[period];
  expect(f.countEvents()).toBe(5);
  expect(f.event(corrected.requestId)).toMatchObject({ amount: 2000, author_id: bruno.id });
  expect(f.event(correction.requestId)).toMatchObject({ amount: 1500, author_id: ana.id });
  expect(balance(month, reserve)).toBe(3500);
  expect(balance(month, bank)).toBe(30000);
  expect(realized(month, 'compras')).toBe(1500);
  expect(month.events.filter((entry) => entry.line?.kind === 'income')).toEqual([]);
  expect(
    db
      .prepare(`SELECT sum(delta) AS n FROM effects WHERE space_id=? AND period=? AND source=?`)
      .get(f.spaceId, period, reserve)?.n,
  ).toBe(-1500);
  const compensation = month.events.find((entry) => entry.reverses === corrected.requestId)!;
  expect(compensation).toMatchObject({ amount: -2000, date, type: 'reversal' });
  const history = await ok<{ entries: { id: string; author: string; createdAt: string }[] }>(
    await f.b.history(
      '&' +
        new URLSearchParams([
          ['eventId', corrected.requestId],
          ['eventId', compensation.id],
          ['eventId', correction.requestId],
        ]),
    ),
  );
  expect(history.entries).toMatchObject([
    {
      id: corrected.requestId,
      author: 'Bruno Sintética',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    },
    { id: compensation.id, author: 'Ana Sintética', createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
    {
      id: correction.requestId,
      author: 'Ana Sintética',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    },
  ]);
  expect(month.events.find((entry) => entry.id === correction.requestId)?.date).toBe(period + '-15');
});

it('A11/A28: falhas antes do recibo e no commit não deixam metade de uma correção', async () => {
  const f = await fixture('Rollback da correção');
  const revision = await f.setup(expense('despesa', true));
  const original = command(revision, { ...purchase('despesa', 2000), source: reserve });
  await ok(await f.b.send(original));
  const observed = await f.a.read();
  const correction = command(observed.revision, {
    type: 'correct',
    id: original.requestId,
    replacement: {
      ...purchase('despesa', 1500),
      source: reserve,
    },
  });
  const id = correction.requestId;
  await ok(await f.a.change('prepare', id));
  const match = "NEW.request_id='" + id + "' AND NEW.status='confirmed'";
  for (const failure of [
    `CREATE TRIGGER fail_receipt BEFORE UPDATE OF status ON receipts WHEN ${match}
      BEGIN SELECT RAISE(ABORT,'falha sintética antes do recibo'); END`,
    `CREATE TABLE test_parent(id INTEGER PRIMARY KEY);
      CREATE TABLE test_deferred(id INTEGER REFERENCES test_parent(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER fail_receipt AFTER UPDATE OF status ON receipts WHEN ${match}
        BEGIN INSERT INTO test_deferred VALUES(99); END`,
  ]) {
    db.exec(failure);
    try {
      await problem(await f.a.send(correction), 'STORAGE', 503);
      expect(f.countEvents()).toBe(1);
      expect(f.event(id)).toBeUndefined();
      const after = await f.b.read();
      expect(after.revision).toBe(observed.revision);
      expect(balance(after.state.months[period], reserve)).toBe(3000);
      expect(await ok(await f.a.reference(id))).toMatchObject({ request: { status: 'pending' } });
    } finally {
      db.exec('DROP TRIGGER fail_receipt');
    }
  }
  expect(db.prepare('SELECT count(*) AS n FROM test_deferred').get()?.n).toBe(0);
  await ok(await f.actor(1, ana).send(correction));
  expect(f.countEvents()).toBe(3);
  expect(balance((await f.a.read()).state.months[period], reserve)).toBe(3500);
  expect(await ok(await f.a.reference(id))).toMatchObject({ request: { status: 'confirmed' } });
});

type Invite = { id: string; code: string; expires: number };
const sharing = (processIndex: number, actor: Person, space?: string, input?: object) =>
  processes[processIndex].request(actor, '/api/sharing' + (space ? '?spaceId=' + space : ''), input);
const issueInvite = (space: string, guest: Person, role = 'reader') =>
  sharing(0, ana, space, { action: 'issue', email: guest.email.toUpperCase(), role }).then(ok<Invite>);
const acceptCode = (processIndex: number, actor: Person, code: string) =>
  sharing(processIndex, actor, undefined, { action: 'acceptInvite', code });
const membership = (space: string, guest: Person) =>
  db.prepare('SELECT role,IsDeleted FROM memberships WHERE space_id=? AND user_id=?').get(space, guest.id);

it('MU4 A03–A06: convites isolados, aceitação simultânea, histórico e matriz HTTP', async () => {
  const f = await fixture('Arquivos partilhados', []);
  const other = await fixture('Segundo espaço partilhado', []);
  const revision = await f.setup(expense('partilhada', true));
  const old = command(revision, purchase('partilhada', 980, 'Movimento anterior ao convite'));
  await ok(await f.a.send(old));
  const invite = await issueInvite(f.spaceId, bruno);
  const different = await issueInvite(other.spaceId, bruno, 'editor');
  expect(different.code).not.toBe(invite.code);
  expect(invite.expires - Date.now()).toBeGreaterThan(6.99 * 86_400_000);
  expect(await ok(await sharing(0, ana, f.spaceId))).toMatchObject({ role: 'owner', shared: false });
  const invites = await ok<{ invites: object[] }>(await sharing(0, ana, f.spaceId));
  expect(invites.invites).toEqual([
    { id: invite.id, email: bruno.email, role: 'reader', expires: invite.expires },
  ]);
  expect(db.prepare('SELECT digest,address FROM space_invites WHERE id=?').get(invite.id)).toMatchObject({
    digest: digest(invite.code),
    address: expect.not.stringContaining(bruno.email),
  });
  const wrong = await problem(await acceptCode(1, carla, invite.code), 'INVITE', 422);
  expect(JSON.stringify(wrong)).not.toContain(bruno.email);

  const denied = await Promise.all([
    f.c.send(old),
    f.c.history('&eventId=' + old.requestId),
    f.c.reference(old.requestId),
    sharing(1, carla, f.spaceId),
    sharing(1, carla, f.spaceId, { action: 'remove', memberId: ana.id }),
    processes[1].request(carla, '/api/state?spaceId=' + f.spaceId + '&search=anterior'),
  ]);
  for (const deniedResponse of denied) await problem(deniedResponse, 'SPACE_ACCESS', 403);

  const concurrent = await Promise.all([
    acceptCode(0, bruno, invite.code),
    acceptCode(1, bruno, invite.code),
  ]);
  for (const response of concurrent) expect(await ok(response)).toEqual({ spaceId: f.spaceId });
  expect(membership(f.spaceId, bruno)).toMatchObject({ role: 'reader', IsDeleted: 0 });
  expect(
    db.prepare('SELECT status,address,accepted_by FROM space_invites WHERE id=?').get(invite.id),
  ).toMatchObject({ status: 'accepted', address: null, accepted_by: bruno.id });
  expect(membership(other.spaceId, bruno)).toBeUndefined();
  expect(await ok(await acceptCode(1, bruno, different.code))).toEqual({ spaceId: other.spaceId });
  expect(membership(other.spaceId, bruno)?.role).toBe('editor');
  await ok(
    await other.b.send(
      command((await other.b.read()).revision, {
        type: 'category',
        category: { id: 'editor', name: 'Adicionada por editor' },
      }),
    ),
  );
  await problem(
    await sharing(1, bruno, other.spaceId, { action: 'issue', email: carla.email, role: 'reader' }),
    'ACCESS',
    403,
  );
  expect((await f.b.read()).state.months[period].events).toHaveLength(1);
  expect(await ok(await f.b.history('&eventId=' + old.requestId))).toMatchObject({
    entries: [{ id: old.requestId, author: 'Ana Sintética' }],
  });
  const shared = await ok(await sharing(1, bruno, f.spaceId));
  expect(shared).toMatchObject({ role: 'reader', shared: true, invites: [] });
  expect(JSON.stringify(shared)).not.toContain(ana.email);
  await problem(await f.b.send(old), 'READ_ONLY', 403);
  await problem(await f.b.reference(old.requestId), 'READ_ONLY', 403);
  await problem(await f.b.change('prepare', old.requestId), 'READ_ONLY', 403);
  for (const operation of [
    { action: 'issue', email: carla.email, role: 'reader' },
    { action: 'remove', memberId: ana.id },
    { action: 'role', memberId: ana.id, role: 'reader' },
    { action: 'regenerate', id: invite.id },
    { action: 'revoke', id: invite.id },
  ])
    await problem(await sharing(1, bruno, f.spaceId, operation), 'ACCESS', 403);
  for (const actor of [ana, bruno, carla]) {
    expect(
      (await processes[0].request(actor, '/api/local-files?action=export&spaceId=' + f.spaceId, {})).status,
    ).toBe(403);
  }
  const newRole = await issueInvite(f.spaceId, bruno, 'editor');
  await ok(await acceptCode(1, bruno, newRole.code));
  expect(membership(f.spaceId, bruno)?.role).toBe('reader');
  expect(f.countEvents()).toBe(1);
});

it('MU4 A06/A24/A31: expiração, revogação, reemissão e alteração confirmada de email', async () => {
  const f = await fixture('Validade de convites', []);
  const guest = person('Convidada');
  const expired = await issueInvite(f.spaceId, guest);
  db.prepare('UPDATE space_invites SET created=1,expires=2 WHERE id=?').run(expired.id);
  await problem(await acceptCode(1, guest, expired.code), 'INVITE', 422);
  const original = await issueInvite(f.spaceId, guest);
  const reissued = await ok<Invite>(
    await sharing(1, ana, f.spaceId, { action: 'regenerate', id: original.id }),
  );
  await problem(await acceptCode(0, guest, original.code), 'INVITE', 422);
  const outcomes = await Promise.all([
    sharing(0, ana, f.spaceId, { action: 'revoke', id: reissued.id }),
    acceptCode(1, guest, reissued.code),
  ]);
  const acceptedFirst = outcomes[1].ok;
  expect(outcomes.map((r) => r.status)).toEqual(acceptedFirst ? [422, 200] : [200, 422]);
  expect(membership(f.spaceId, guest)?.role).toBe(acceptedFirst ? 'reader' : undefined);
  if (acceptedFirst) await ok(await sharing(0, ana, f.spaceId, { action: 'remove', memberId: guest.id }));
  const revokeFirst = await issueInvite(f.spaceId, guest);
  await ok(await sharing(0, ana, f.spaceId, { action: 'revoke', id: revokeFirst.id }));
  await problem(await acceptCode(1, guest, revokeFirst.code), 'INVITE', 422);
  const beforeEmail = await issueInvite(f.spaceId, guest);
  const password = 'Uma frase para identidade sintetica';
  db.prepare('INSERT INTO credentials(user_id,password_hash) VALUES(?,?)').run(guest.id, hashSync(password));
  const newEmail = 'convidada-alterada@example.invalid';
  const token = randomBytes(32).toString('base64url');
  db.prepare('UPDATE users SET pending_email=? WHERE id=?').run(newEmail, guest.id);
  db.prepare("INSERT INTO challenges VALUES(?,?,'email',?,?,?)").run(
    randomUUID(),
    guest.id,
    newEmail,
    digest(token),
    Date.now() + 60_000,
  );
  await ok(await processes[0].request(guest, '/api/identity', { action: 'confirmEmail', token }));
  await problem(await acceptCode(1, guest, beforeEmail.code), 'ACCESS', 403);
  const login = await processes[1].request({ ...guest, id: '', cookie: '' }, '/api/identity', {
    action: 'login',
    email: newEmail,
    password,
  });
  await ok(login);
  const current = {
    ...guest,
    email: newEmail,
    cookie: login.headers.get('set-cookie')!.split(';')[0].split('=')[1],
  };
  await problem(await acceptCode(1, current, beforeEmail.code), 'INVITE', 422);
  const currentInvite = await issueInvite(f.spaceId, current);
  await ok(await acceptCode(1, current, currentInvite.code));
  expect(db.prepare('SELECT id,email,verified FROM users WHERE id=?').get(guest.id)).toMatchObject({
    id: guest.id,
    email: newEmail,
    verified: 1,
  });
});

it('MU4 A07/A31: despromoção e remoção fecham pendentes e recusam repetições', async () => {
  const f = await fixture('Permissões em mudança', []);
  await ok(await acceptCode(1, bruno, (await issueInvite(f.spaceId, bruno, 'editor')).code));
  const revision = await f.setup(expense('histórico', true));
  const committed = command(revision, purchase('histórico', 1420));
  await ok(await f.b.send(committed));
  const pending = command(revision + 1, purchase('histórico', 1900));
  await ok(await f.b.change('prepare', pending.requestId));
  const role = (value: string) =>
    sharing(0, ana, f.spaceId, { action: 'role', memberId: bruno.id, role: value });
  await ok(await role('reader'));
  for (const r of [
    await f.b.send(pending),
    await f.b.send(committed),
    await f.b.reference(committed.requestId),
  ])
    await problem(r, 'READ_ONLY', 403);
  expect(f.event(pending.requestId)).toBeUndefined();
  expect((await f.b.read()).state.months[period].events).toHaveLength(1);
  await ok(await role('editor'));
  expect(await ok(await f.b.reference(pending.requestId))).toMatchObject({ request: { status: 'closed' } });
  await problem(await f.b.send(pending), 'IDEMPOTENCY', 422);
  const unusedInvite = await issueInvite(f.spaceId, bruno);
  await ok(await sharing(0, ana, f.spaceId, { action: 'remove', memberId: bruno.id }));
  await problem(await acceptCode(1, bruno, unusedInvite.code), 'INVITE', 422);
  for (const r of [
    await f.b.send(committed),
    await f.b.reference(committed.requestId),
    await f.b.history('&eventId=' + committed.requestId),
  ])
    await problem(r, 'SPACE_ACCESS', 403);
  expect(f.countEvents()).toBe(1);
  expect(balance((await f.a.read()).state.months[period], bank)).toBe(28580);
});

it('MU4 A16/A31: só um proprietário durante corridas com saída, remoção e eliminação', async () => {
  const password = 'Palavra passe do proprietario de ensaio';
  db.prepare('INSERT INTO credentials(user_id,password_hash) VALUES(?,?)').run(ana.id, hashSync(password));
  const owners = (space: string) =>
    db
      .prepare(`SELECT s.owner_id,m.user_id FROM spaces s JOIN memberships m
    ON m.space_id=s.id WHERE s.id=? AND m.role='owner' AND m.IsDeleted=0`)
      .all(space);
  for (const action of [
    'leave',
    'remove',
    'delete',
    'declineTransfer',
    'cancelTransfer',
    'expire',
    'acceptTransfer',
  ]) {
    const f = await fixture('Propriedade ' + action, [bruno, carla]);
    const scope = f.spaceId;
    const propose = (actor: Person, secret: string) =>
      processes[0].request(actor, '/api/identity', {
        action: 'proposeTransfer',
        spaceId: scope,
        memberId: bruno.id,
        password: secret,
      });
    if (action === 'acceptTransfer') {
      expect((await propose(ana, 'incorreta')).status).toBe(403);
      await problem(await sharing(0, ana, scope, { action: 'leave' }), 'ACCESS', 403);
    }
    await ok(await propose(ana, password));
    const read = await ok<{ transfer: { id: string } }>(await sharing(1, bruno, scope));
    const transferId = read.transfer.id;
    const acceptTransfer = () => sharing(1, bruno, scope, { action: 'acceptTransfer', id: transferId });
    let transferred = false;
    if (action === 'leave' || action === 'remove') {
      const revoke =
        action === 'leave'
          ? sharing(0, bruno, scope, { action: 'leave' })
          : sharing(0, ana, scope, { action: 'remove', memberId: bruno.id });
      const [removed, accepted] = await Promise.all([revoke, acceptTransfer()]);
      expect(removed.ok).not.toBe(accepted.ok);
      transferred = accepted.ok;
    } else if (action === 'delete') {
      db.exec('BEGIN IMMEDIATE');
      const queued = acceptTransfer();
      try {
        expect(await Promise.race([queued.then(() => true), delay(100, false)])).toBe(false);
        db.prepare('UPDATE spaces SET IsDeleted=1,DeletedAt=?,ModifiedAt=? WHERE id=?').run(
          new Date(0).toISOString(),
          new Date(0).toISOString(),
          scope,
        );
        db.exec('COMMIT');
      } finally {
        if (db.isTransaction) db.exec('ROLLBACK');
      }
      await problem(await queued, 'SPACE_ACCESS', 403);
    } else if (action === 'acceptTransfer') {
      const other = await issueInvite(scope, carla);
      const accepted = await Promise.all([
        acceptTransfer(),
        sharing(0, bruno, scope, { action, id: transferId }),
      ]);
      for (const response of accepted) await ok(response);
      transferred = true;
      await problem(await acceptCode(0, carla, other.code), 'INVITE', 422);
      await problem(await sharing(0, ana, scope, { action: 'remove', memberId: carla.id }), 'ACCESS', 403);
      expect(membership(scope, ana)?.role).toBe('editor');
    } else {
      if (action === 'expire')
        db.prepare('UPDATE ownership_transfers SET created=1,expires=2 WHERE id=?').run(transferId);
      else
        await ok(
          await sharing(0, action === 'declineTransfer' ? bruno : ana, scope, { action, id: transferId }),
        );
      await problem(await acceptTransfer(), 'ACCESS', 409);
    }
    const owner = transferred ? bruno.id : ana.id;
    expect(owners(scope)).toEqual([{ owner_id: owner, user_id: owner }]);
    expect(() =>
      db.prepare("UPDATE memberships SET role='reader' WHERE space_id=? AND user_id=?").run(scope, owner),
    ).toThrow();
    expect(() =>
      db.prepare("UPDATE memberships SET role='owner' WHERE space_id=? AND user_id!=?").run(scope, owner),
    ).toThrow();
  }
});

it('MU5 A16/A39: eliminação, transferência aceite e encerramento disputam o espaço entre processos', async () => {
  const password = 'Credencial sintética para encerramento';
  for (const cancelFirst of [true, false]) {
    const bruno = person('Destinatario' + randomUUID());
    const owner = person('Proprietario' + randomUUID());
    db.prepare('INSERT INTO credentials(user_id,password_hash) VALUES(?,?)').run(
      owner.id,
      hashSync(password),
    );
    const { space } = await ok<{ space: { id: string } }>(
      await processes[0].request(owner, '/api/spaces', { name: 'Casa de corrida', requestId: randomUUID() }),
    );
    db.prepare("INSERT INTO memberships(space_id,user_id,role) VALUES(?,?,'editor')").run(space.id, bruno.id);
    const close = await processes[0].request(owner, '/api/identity', { action: 'closeAccount', password });
    await ok(close);
    const closure = {
      ...owner,
      cookie: close.headers.get('set-cookie')!.match(/omeumes-session=([^;]+)/)![1],
    };
    expect((await processes[1].request(closure, '/api/state?spaceId=' + space.id)).status).toBe(403);
    await ok(await processes[1].request(bruno, '/api/state?spaceId=' + space.id));
    const intent = (action: string) =>
      processes[0].request(closure, '/api/identity', {
        action,
        password,
        spaceId: space.id,
        ...(action === 'proposeTransfer' ? { memberId: bruno.id } : {}),
      });
    await ok(await intent('proposeTransfer'));
    const proposal = String(
      db.prepare('SELECT id FROM ownership_transfers WHERE space_id=?').get(space.id)?.id,
    );
    await ok(await intent('deleteSpace'));
    expect((await sharing(1, bruno, space.id, { action: 'acceptTransfer', id: proposal })).ok).toBe(false);
    const end = Number(db.prepare('SELECT delete_due FROM spaces WHERE id=?').get(space.id)?.delete_due);
    const worker = fork(
      'tests/integration/mu5-cleanup-worker.mjs',
      [join(directory, 'fixture.sqlite'), String(end)],
      { env: { ...process.env, OMEUMES_AUTH_KEY: key }, silent: true },
    );
    const next = async (signal: string) => expect((await once(worker, 'message'))[0]).toBe(signal);
    try {
      await next('ready');
      if (cancelFirst) {
        await ok(await intent('cancelDeletion'));
        await ok(await intent('proposeTransfer'));
        const id = String(
          db.prepare("SELECT id FROM ownership_transfers WHERE status='pending' AND space_id=?").get(space.id)
            ?.id,
        );
        const [accepted, deletion] = await Promise.all([
          sharing(1, bruno, space.id, { action: 'acceptTransfer', id }),
          intent('deleteSpace'),
        ]);
        expect(accepted.ok).not.toBe(deletion.ok);
        if (deletion.ok) {
          await ok(await intent('cancelDeletion'));
          await ok(await intent('proposeTransfer'));
          const newId = String(
            db
              .prepare("SELECT id FROM ownership_transfers WHERE status='pending' AND space_id=?")
              .get(space.id)?.id,
          );
          await ok(await sharing(1, bruno, space.id, { action: 'acceptTransfer', id: newId }));
        }
        const locked = next('locked');
        worker.send('clean');
        await locked;
        const done = next('done');
        worker.send('commit');
        await done;
        expect(db.prepare('SELECT owner_id,delete_due FROM spaces WHERE id=?').get(space.id)).toMatchObject({
          owner_id: bruno.id,
          delete_due: null,
        });
      } else {
        const locked = next('locked');
        worker.send('clean');
        await locked;
        const cancel = intent('cancelDeletion');
        expect(await Promise.race([cancel.then(() => true), delay(120, false)])).toBe(false);
        const done = next('done');
        worker.send('commit');
        await done;
        expect((await cancel).ok).toBe(false);
        expect(db.prepare('SELECT 1 FROM spaces WHERE id=?').get(space.id)).toBeUndefined();
      }
      expect(
        db.prepare("SELECT 1 FROM users WHERE id=? AND lifecycle!='Deleted'").get(owner.id),
      ).toBeUndefined();
      expect(db.prepare('SELECT 1 FROM credentials WHERE user_id=?').get(owner.id)).toBeUndefined();
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      worker.kill();
    }
  }
});
