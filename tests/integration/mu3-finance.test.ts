import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { authorizeSpace } from '../../src/modules/spaces/access';
import type { Action, Execution } from '../../src/modules/finance/domain/actions';
import type { Line } from '../../src/modules/finance/domain/model';
import {
  balance,
  pending,
  realized,
  reserveUse,
  sourceTotals,
  totalUnallocated,
} from '../../src/modules/finance/domain/projections';
import { applyCommand, historyDetails, readMonth } from '../../src/modules/finance/infrastructure/repository';
import { createBackup, restoreBackup, verifyCopy } from '../../src/server/local-files.mjs';
import { connect, migrate, migrations } from '../../src/server/storage.mjs';

const temp = realpathSync(tmpdir());
const directories: string[] = [];
const period = '2032-03';
const following = '2032-04';
const owner = 'ana-sintetica';
const space = 'espaco-sintetico';
const bank = 'a:corrente';
const other = 'a:segundo';
const savings = 'r:reserva';
const line: Line = {
  id: 'compras',
  name: 'Compras de ensaio',
  kind: 'expense',
  variable: true,
  accountId: 'corrente',
  categoryId: '',
  plan: 8500,
};
const bill: Line = {
  ...line,
  id: 'despesa',
  name: 'Despesa fixa de ensaio',
  variable: false,
  accountId: 'segundo',
  reserveId: 'reserva',
  plan: 2000,
};
const goal: Line = { ...bill, id: 'objetivo', name: 'Objetivo de ensaio', kind: 'saving', plan: 1500 };
const action20: Execution = {
  type: 'execute',
  lineId: bill.id,
  source: savings,
  complete: true,
  amount: 2000,
  date: period + '-02',
};
// Literal SHA-256 input from a v6 client, independent of the new canonicalizer.
const digest20 = createHash('sha256')
  .update(
    '{"action":{"amount":2000,"complete":true,"date":"2032-03-02","lineId":"despesa","source":"r:reserva","type":"execute"},"period":"2032-03"}',
  )
  .digest('hex');

function temporaryDatabase() {
  const directory = mkdtempSync(join(temp, 'omeumes-test-mu3-ledger-'));
  directories.push(directory);
  return join(directory, 'fixture.sqlite');
}
afterEach(() => {
  for (const d of directories.splice(0)) {
    const actual = realpathSync(d);
    if (dirname(actual) !== temp || !basename(actual).startsWith('omeumes-test-mu3-ledger-'))
      throw new Error('Diretório de teste inesperado.');
    rmSync(actual, { recursive: true, force: true, maxRetries: 5 });
  }
});

function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Construct the on-disk MU2 representation directly, without calling the MU3 domain or repository.
function fixture(history = false) {
  const path = temporaryDatabase();
  migrate(path, migrations.slice(0, 6), true);
  const db = connect(path);
  try {
    transaction(db, () => {
      const put = (table: string, row: Record<string, SQLInputValue>) =>
        db
          .prepare(
            `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row)
              .map(() => '?')
              .join(',')})`,
          )
          .run(...Object.values(row));
      put('users', {
        id: owner,
        email: 'ana@example.invalid',
        verified: 1,
        first_name: 'Ana',
        last_name: 'Sintética',
        country: 'PT',
        adult_at: 1,
        created: 1,
      });
      put('spaces', { id: space, owner_id: owner, name: 'Ensaio', creation_key: 'criar' });
      put('memberships', { space_id: space, user_id: owner });
      const add = (table: string, row: Record<string, SQLInputValue>) =>
        put(table, { space_id: space, ...row });
      add('meta', { revision: 19 });
      const accounts = ['corrente', 'segundo'].map((id) => ({
        id,
        name: id,
        color: '#123456',
        restricted: false,
      }));
      for (const a of accounts) {
        add('accounts', { id: a.id, payload: JSON.stringify(a) });
        add('origins', { id: 'a:' + a.id, account_id: a.id });
      }
      const reserve = { id: 'reserva', name: 'Reserva sintética', accountId: 'segundo' };
      add('reserves', { id: reserve.id, account_id: reserve.accountId, payload: JSON.stringify(reserve) });
      add('origins', { id: savings, reserve_id: reserve.id });
      add('months', { period });
      for (const [source, amount] of [
        [bank, 10000],
        [other, 0],
        [savings, 5000],
      ] as const)
        add('initials', { period, source, amount });
      for (const { plan, ...metadata } of [line, bill, goal])
        add('lines', {
          period,
          id: metadata.id,
          removed: 0,
          account_id: metadata.accountId,
          reserve_id: metadata.reserveId ?? null,
          plan,
          payload: JSON.stringify(metadata),
        });
      add('snapshots', {
        period,
        format: 1,
        payload: JSON.stringify({
          date: period + '-01',
          lines: [line, bill, goal],
          catalog: { accounts, reserves: [reserve], categories: [] },
        }),
      });
      if (!history) return;
      const event = (
        id: string,
        type: string,
        l: Line | null,
        amount: number,
        deltas: Record<string, number>,
        metadata: object = {},
        columns: Record<string, SQLInputValue> = {},
      ) => {
        add('events', {
          period,
          id,
          line_id: l?.id ?? null,
          amount,
          payload: JSON.stringify({
            id,
            type,
            lineId: l?.id,
            line: l ?? undefined,
            date: period + '-02',
            note: 'Ensaio',
            ...metadata,
          }),
          ...columns,
        });
        for (const [source, delta] of Object.entries(deltas))
          add('effects', { period, event_id: id, source, delta });
      };
      event('compra', 'execution', line, 4000, { [bank]: -4000 });
      event('total', 'total', line, 2000, { [bank]: -2000 });
      add('observations', { period, event_id: 'total', observed: 6000, calculated: 4000, purchases: 4000 });
      event('detalhe', 'detail', line, 0, {}, {}, { purchase_amount: 700 });
      add('allocations', { period, event_id: 'detalhe', parent_id: 'total', amount: 700 });
      event(
        'antigo',
        'execution',
        bill,
        2000,
        { [savings]: -2000 },
        { voided: true, complete: true },
        { replaced_by: 'substituto' },
      );
      event(
        'substituto',
        'execution',
        bill,
        1500,
        { [savings]: -1500 },
        { complete: false },
        { corrects: 'antigo', author_id: owner },
      );
      event('ponte', 'transfer', null, 0, { [bank]: -2500, [other]: 2500 }, { voided: true });
      event(
        'reforco',
        'saving',
        null,
        0,
        { [other]: -2500, [savings]: 2500 },
        { voided: true, saving: { reserveId: reserve.id, extra: 2500, transferId: 'ponte' } },
      );
      event('associacao', 'savingAssociation', goal, 1500, {}, { voided: true, savingParentId: 'reforco' });
      add('receipts', {
        user_id: owner,
        request_id: 'antigo',
        period,
        status: 'confirmed',
        fingerprint: digest20,
      });
      add('receipts', { user_id: owner, request_id: 'encerrado', period, status: 'closed' });
    });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
  return path;
}

function read(db: DatabaseSync, selected = period) {
  return transaction(db, () => readMonth(db, authorizeSpace(db, owner, space, 'read'), selected));
}
function write(db: DatabaseSync, action: Action, requestId: string, revision = read(db).revision) {
  return transaction(db, () =>
    applyCommand(db, authorizeSpace(db, owner, space, 'write'), { period, action, revision, requestId }),
  );
}
// Sum real SQLite rows, independently of every product projection. In v6 only
// active rows participated. In v7 every original and every inverse participates.
function ledger(db: DatabaseSync, legacy = false) {
  const filter = legacy ? " AND coalesce(json_extract(e.payload,'$.voided'),0)=0" : '';
  return db
    .prepare(`SELECT i.source, i.amount+coalesce((SELECT sum(f.delta) FROM effects f
    JOIN events e ON (e.space_id,e.period,e.id)=(f.space_id,f.period,f.event_id)
    WHERE (f.space_id,f.period,f.source)=(i.space_id,i.period,i.source)${filter}),0) AS balance
    FROM initials i WHERE i.space_id=? AND i.period=? ORDER BY i.source`)
    .all(space, period);
}
const balances = (a: number, b: number, r: number) => [
  { source: bank, balance: a },
  { source: other, balance: b },
  { source: savings, balance: r },
];
function originals(db: DatabaseSync, ids: string[]) {
  return db
    .prepare(`SELECT id,line_id,amount,purchase_amount,corrects,replaced_by,author_id,payload,AddedAt,ModifiedAt
    FROM events WHERE space_id=? AND period=? AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`)
    .all(space, period, ...ids);
}
function inverses(db: DatabaseSync) {
  return db
    .prepare(`SELECT json_extract(payload,'$.reverses') AS original, amount, author_id
    FROM events WHERE space_id=? AND period=? AND json_extract(payload,'$.type')='reversal' ORDER BY original`)
    .all(space, period);
}

it('A20/A30/A32 preserva as contas, correções, allocations, instantâneos e recibos v6 após migração e restauro', async () => {
  const path = fixture(true);
  const old = connect(path);
  const ids = ['compra', 'total', 'detalhe', 'antigo', 'substituto', 'ponte', 'reforco', 'associacao'];
  let before, snapshot;
  try {
    expect(ledger(old, true)).toEqual(balances(4000, 0, 3500));
    before = originals(old, ids);
    snapshot = old.prepare('SELECT payload FROM snapshots').get()?.payload;
  } finally {
    old.close();
  }
  const oldBackup = await createBackup(path);
  const oldRestore = join(dirname(path), 'recuperada-v6.sqlite');
  await restoreBackup(oldBackup.path, oldRestore, path);
  for (const p of [path, oldRestore]) {
    expect(migrate(p, undefined, true).version).toBe(9);
    expect(migrate(p).version).toBe(9);
    const db = connect(p);
    try {
      expect(originals(db, ids)).toEqual(before);
      expect(ledger(db)).toEqual(balances(4000, 0, 3500));
      expect(inverses(db)).toEqual([
        { original: 'antigo', amount: -2000, author_id: null },
        { original: 'associacao', amount: -1500, author_id: null },
        { original: 'ponte', amount: 0, author_id: null },
        { original: 'reforco', amount: 0, author_id: null },
      ]);
      const { state } = read(db);
      const m = state.months[period];
      const history = transaction(db, () =>
        historyDetails(
          db,
          authorizeSpace(db, owner, space, 'read'),
          period,
          m.events.map((e) => e.id),
        ),
      ).entries;
      for (const e of m.events.filter((e) => e.historical))
        expect(history.find((item) => item.id === e.id)).toMatchObject({ author: null, createdAt: null });
      expect(history.find((item) => item.id === 'antigo')).toMatchObject({ author: null, createdAt: null });
      expect(history.find((item) => item.id === 'substituto')).toMatchObject({
        author: 'Ana Sintética',
        createdAt: expect.stringMatching(/Z$/),
      });
      expect([balance(m, bank), balance(m, other), balance(m, savings)]).toEqual([4000, 0, 3500]);
      expect([realized(m, line.id), realized(m, bill.id), realized(m, goal.id)]).toEqual([6000, 1500, 0]);
      expect([
        pending(m, bill),
        pending(m, goal),
        totalUnallocated(m, m.events.find((e) => e.id === 'total')!),
      ]).toEqual([500, 1500, 1300]);
      expect(sourceTotals(state, m).wealth).toBe(7500);
      expect(reserveUse(m, 'reserva')).toEqual({ spent: 1500, withdrawn: 1500 });
      expect(db.prepare('SELECT payload FROM snapshots').get()?.payload).toBe(snapshot);
      expect(write(db, action20, 'antigo', 0).replay).toBe(true);
      expect(() => write(db, { ...action20, amount: 1900 }, 'antigo')).toThrow();
      expect(() => write(db, action20, 'encerrado')).toThrow();
      expect(originals(db, ids)).toEqual(before);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      if (p === path) {
        write(db, { type: 'month', period: following }, 'captura');
        expect(read(db, following).state.months[following].initials).toEqual({
          [bank]: 4000,
          [other]: 0,
          [savings]: null,
        });
      }
    } finally {
      db.close();
    }
  }
  const backup = await createBackup(path);
  verifyCopy(backup.path);
  const restored = join(dirname(path), 'recuperada-v7.sqlite');
  await restoreBackup(backup.path, restored, path);
  const db = new DatabaseSync(restored);
  try {
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(9);
    expect(db.prepare('SELECT restored FROM identity_control').get()?.restored).toBe(1);
    expect(ledger(db)).toEqual(balances(4000, 0, 3500));
    expect(originals(db, ids)).toEqual(before);
    expect(write(db, action20, 'antigo', 0).replay).toBe(true);
    expect(() => write(db, action20, 'encerrado')).toThrow();
  } finally {
    db.close();
  }
});

it.each(['reverter', 'corrigir'] as const)(
  'A28 %s a despesa de 20 EUR paga pela poupança preserva o original e o plano',
  (mode) => {
    const path = fixture();
    migrate(path, undefined, true);
    const db = connect(path);
    try {
      write(db, action20, 'pagamento');
      const original = originals(db, ['pagamento']);
      const snapshot = db.prepare('SELECT payload FROM snapshots').get();
      expect(ledger(db)).toEqual(balances(10000, 0, 3000));
      const action: Action =
        mode === 'reverter'
          ? { type: 'void', id: 'pagamento' }
          : {
              type: 'correct',
              id: 'pagamento',
              replacement: { ...action20, amount: 1500, complete: false, date: period + '-05' },
            };
      // Abort after the inverse was persisted but before the replacement or receipt is committed.
      if (mode === 'corrigir') {
        db.exec(
          "CREATE TRIGGER test_failure BEFORE INSERT ON events WHEN NEW.corrects='pagamento' BEGIN SELECT RAISE(ABORT,'falha entre compensação e substituição'); END",
        );
        try {
          expect(() => write(db, action, 'alteracao')).toThrow(/falha entre/);
          expect(inverses(db)).toEqual([]);
          expect(ledger(db)).toEqual(balances(10000, 0, 3000));
          expect(
            db.prepare("SELECT status FROM receipts WHERE request_id='alteracao'").get(),
          ).toBeUndefined();
        } finally {
          db.exec('DROP TRIGGER test_failure');
        }
      }
      write(db, action, 'alteracao');
      expect(write(db, action, 'alteracao', 0).replay).toBe(true);
      expect(() => write(db, action, 'outra-alteracao')).toThrow();
      expect(originals(db, ['pagamento'])).toEqual(original);
      expect(inverses(db)).toEqual([{ original: 'pagamento', amount: -2000, author_id: owner }]);
      const { state } = read(db);
      const m = state.months[period];
      const spent = mode === 'reverter' ? 0 : 1500;
      expect(ledger(db)).toEqual(balances(10000, 0, 5000 - spent));
      expect([realized(m, bill.id), pending(m, bill), balance(m, savings)]).toEqual([
        spent,
        2000 - spent,
        5000 - spent,
      ]);
      expect(reserveUse(m, 'reserva')).toEqual({ spent, withdrawn: spent });
      expect(sourceTotals(state, m).wealth).toBe(15000 - spent);
      expect(sourceTotals(state, m, savings)).toMatchObject({ incoming: 0, outgoing: spent });
      expect(m.events.filter((e) => e.line?.kind === 'income')).toEqual([]);
      expect(db.prepare('SELECT payload FROM snapshots').get()).toEqual(snapshot);
      const inverse = db
        .prepare("SELECT id,payload FROM events WHERE json_extract(payload,'$.reverses')='pagamento'")
        .get()!;
      expect(db.prepare('SELECT source,delta FROM effects WHERE event_id=?').all(inverse.id)).toEqual([
        { source: savings, delta: 2000 },
      ]);
      if (mode === 'corrigir') {
        const replacement = db.prepare("SELECT payload FROM events WHERE corrects='pagamento'").get()!;
        const group = JSON.parse(String(inverse.payload)).groupId;
        expect(group).toEqual(expect.any(String));
        expect(JSON.parse(String(replacement.payload))).toMatchObject({
          groupId: group,
          date: period + '-05',
        });
      }
    } finally {
      db.close();
    }
  },
);

it('A20 repõe os dois bancos, a poupança e a parcela associada, sem reescrever o mês seguinte', () => {
  const path = fixture();
  migrate(path, undefined, true);
  const db = connect(path);
  try {
    write(
      db,
      { type: 'save', reserveId: 'reserva', source: bank, amount: 2500, date: period + '-02' },
      'reforco',
    );
    write(db, { type: 'associateSaving', eventId: 'reforco', lineId: goal.id, amount: 1500 }, 'associacao');
    expect(ledger(db)).toEqual(balances(7500, 0, 7500));
    const current = read(db).state.months[period];
    expect([realized(current, goal.id), pending(current, goal)]).toEqual([1500, 0]);
    write(db, { type: 'month', period: following }, 'abrir');
    const opening = { [bank]: 7500, [other]: 0, [savings]: null };
    expect(read(db, following).state.months[following].initials).toEqual(opening);
    write(db, { type: 'void', id: 'reforco' }, 'anular');
    expect(ledger(db)).toEqual(balances(10000, 0, 5000));
    expect(inverses(db).map((r) => r.original)).toEqual(['associacao', 'reforco', 'reforco:transfer']);
    const m = read(db).state.months[period];
    expect([realized(m, goal.id), pending(m, goal)]).toEqual([0, 1500]);
    const next = read(db, following).state.months[following];
    expect(next.initials).toEqual(opening);
    expect(next.events).toEqual([]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    // This original has no money effects: the inverse itself must protect its target.
    expect(() => db.prepare("DELETE FROM events WHERE space_id=? AND id='associacao'").run(space)).toThrow();
    expect(() =>
      db
        .prepare(
          "UPDATE events SET payload=json_set(payload,'$.reverses','inexistente') WHERE space_id=? AND reverses='associacao'",
        )
        .run(space),
    ).toThrow();
  } finally {
    db.close();
  }
});

it('A10 pede revisão quando duas parcelas ultrapassariam a obrigação e aceita a diferença revista', () => {
  const path = fixture();
  migrate(path, undefined, true);
  const db = connect(path);
  try {
    const reviewed = read(db).revision;
    const partial = { ...action20, complete: false };
    write(db, { ...partial, amount: 1400 }, 'primeira-parcela', reviewed);
    expect(() => write(db, { ...partial, amount: 1100 }, 'segunda-parcela', reviewed)).toThrow();
    expect(() =>
      write(db, { ...partial, amount: 400, complete: true }, 'fecho-desatualizado', reviewed),
    ).toThrow();
    expect(ledger(db)).toEqual(balances(10000, 0, 3600));
    write(db, { ...partial, amount: 600 }, 'parcela-revista');
    const settled = read(db).state.months[period];
    expect([realized(settled, bill.id), pending(settled, bill)]).toEqual([2000, 0]);
    expect(ledger(db)).toEqual(balances(10000, 0, 3000));
  } finally {
    db.close();
  }
});

it('A20 anular e corrigir detalhes altera só a parcela detalhada, sem voltar a debitar a conta', () => {
  const path = fixture();
  migrate(path, undefined, true);
  const db = connect(path);
  try {
    const pay: Execution = { ...action20, lineId: line.id, source: bank, complete: false, amount: 4000 };
    write(db, pay, 'compra');
    write(db, { ...pay, total: true, amount: 6000 }, 'total');
    const detail = { ...pay, includedInTotal: 'total', amount: 700 };
    write(db, detail, 'detalhe');
    write(
      db,
      { type: 'correct', id: 'detalhe', replacement: { ...detail, amount: 900 } },
      'detalhe-corrigido',
    );
    const check = (unallocated: number) => {
      const m = read(db).state.months[period];
      expect(ledger(db)).toEqual(balances(4000, 0, 5000));
      expect(realized(m, line.id)).toBe(6000);
      expect(totalUnallocated(m, m.events.find((e) => e.id === 'total')!)).toBe(unallocated);
    };
    check(1100);
    write(db, { type: 'void', id: 'detalhe-corrigido' }, 'anular-detalhe');
    check(2000);
    const originals = db.prepare('SELECT event_id, parent_id, amount FROM allocations ORDER BY rowid').all();
    expect(originals).toEqual([
      { event_id: 'detalhe', parent_id: 'total', amount: 700 },
      { event_id: 'detalhe-corrigido', parent_id: 'total', amount: 900 },
    ]);
  } finally {
    db.close();
  }
});

it('A28 corrigir um reforço entre bancos compensa a ponte e reavalia o objetivo e o extra', () => {
  const path = fixture();
  migrate(path, undefined, true);
  const db = connect(path);
  try {
    const deposit = {
      type: 'save' as const,
      reserveId: 'reserva',
      lineId: goal.id,
      source: bank,
      date: period + '-02',
      amount: 2500,
    };
    write(db, deposit, 'deposito');
    const original = originals(db, ['deposito', 'deposito:transfer']);
    expect(ledger(db)).toEqual(balances(7500, 0, 7500));
    write(db, { type: 'correct', id: 'deposito', replacement: { ...deposit, amount: 1000 } }, 'revisto');
    expect(originals(db, ['deposito', 'deposito:transfer'])).toEqual(original);
    expect(inverses(db)).toEqual([
      { original: 'deposito', amount: -1500, author_id: owner },
      { original: 'deposito:transfer', amount: 0, author_id: owner },
    ]);
    const m = read(db).state.months[period];
    expect(ledger(db)).toEqual(balances(9000, 0, 6000));
    expect([realized(m, goal.id), pending(m, goal)]).toEqual([1000, 500]);
    expect(m.events.find((e) => e.id === 'revisto')).toMatchObject({
      groupId: 'revisto',
      corrects: 'deposito',
      saving: { extra: 0, transferId: 'revisto:transfer' },
    });
    expect(m.events.filter((e) => e.groupId === 'revisto')).toHaveLength(4);
  } finally {
    db.close();
  }
});

it('A32/A36 a hora de atribuição de uma compra histórica não prova que a compra seja recente', () => {
  const path = fixture(true);
  migrate(path, undefined, true);
  const db = connect(path);
  try {
    write(db, { ...action20, lineId: line.id, source: bank, amount: 4000, complete: false }, 'outra-compra');
    const m = read(db).state.months[period];
    expect(realized(m, line.id)).toBe(10000);
    expect(ledger(db)).toEqual(balances(0, 0, 3500));
  } finally {
    db.close();
  }
});

it('A11 cada membro conserva o seu recibo quando usa a mesma chave no mesmo espaço', () => {
  const path = fixture();
  migrate(path, undefined, true);
  const db = connect(path);
  try {
    transaction(db, () => {
      db.prepare(
        "INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created) VALUES('bruno','Bruno','Sintético','bruno@example.invalid',1,'PT',1,1)",
      ).run();
      db.prepare("INSERT INTO memberships(space_id,user_id,role) VALUES(?,'bruno','editor')").run(space);
    });
    const revision = read(db).revision;
    const command = {
      period,
      requestId: 'chave-comum',
      revision,
      action: { ...action20, lineId: line.id, source: bank, amount: 500, complete: false },
    };
    const ana = () =>
      transaction(db, () => applyCommand(db, authorizeSpace(db, owner, space, 'write'), command));
    const bruno = () =>
      transaction(db, () =>
        applyCommand(db, authorizeSpace(db, 'bruno', space, 'write'), {
          ...command,
          action: { ...command.action, amount: 3000 },
        }),
      );
    const first = ana(),
      second = bruno();
    expect(first.resultId).toBeTruthy();
    expect(second.resultId).toBeTruthy();
    expect(first.resultId).not.toBe(second.resultId);
    expect(ana()).toMatchObject({ replay: true, resultId: first.resultId });
    expect(bruno()).toMatchObject({ replay: true, resultId: second.resultId });
    expect(ledger(db)).toEqual(balances(6500, 0, 5000));
    const actual = db.prepare('SELECT amount,author_id FROM events ORDER BY rowid').all();
    expect(actual).toEqual([
      { amount: 500, author_id: owner },
      { amount: 3000, author_id: 'bruno' },
    ]);
  } finally {
    db.close();
  }
});

it('A43 uma falha durante a migração deixa a v6 utilizável e permite repetir uma vez', () => {
  const path = fixture(true);
  const db = connect(path);
  try {
    db.exec(`CREATE TRIGGER test_migration_fault BEFORE INSERT ON effects
      WHEN EXISTS (SELECT 1 FROM events WHERE id=NEW.event_id AND json_extract(payload,'$.type')='reversal')
      BEGIN SELECT RAISE(ABORT,'falha no efeito inverso'); END`);
  } finally {
    db.close();
  }
  expect(() => migrate(path, undefined, true)).toThrow(/falha no efeito inverso/);
  const prior = connect(path);
  try {
    expect(prior.prepare('PRAGMA user_version').get()?.user_version).toBe(6);
    expect(prior.prepare('SELECT count(*) AS n FROM events').get()?.n).toBe(8);
    expect(
      prior.prepare("SELECT name FROM sqlite_schema WHERE name='finance_versions'").get(),
    ).toBeUndefined();
    expect(ledger(prior, true)).toEqual(balances(4000, 0, 3500));
    expect(prior.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    prior.exec('DROP TRIGGER test_migration_fault');
  } finally {
    prior.close();
  }
  expect(migrate(path, undefined, true).version).toBe(9);
  expect(migrate(path).version).toBe(9);
  const recovered = connect(path);
  try {
    expect(ledger(recovered)).toEqual(balances(4000, 0, 3500));
    expect(inverses(recovered)).toHaveLength(4);
  } finally {
    recovered.close();
  }
});

it.skipIf(process.platform !== 'win32')(
  'A43 Iniciar.cmd e o migrador recusam v6 sem criar auxiliares ou alterar bytes',
  async () => {
    const path = fixture(true);
    // The real daily entry point probes a port before inspecting the DB. Explicit
    // test mode and an OS-assigned port keep this test away from the daily instance.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
    const files = () =>
      readdirSync(dirname(path))
        .sort()
        .map((name) => [
          name,
          createHash('sha256')
            .update(readFileSync(join(dirname(path), name)))
            .digest('hex'),
        ]);
    const before = files();
    for (const [program, args] of [
      ['cmd.exe', ['/d', '/c', 'Iniciar.cmd']],
      [process.execPath, ['scripts/migrate.mjs']],
    ] as const) {
      const result = spawnSync(program, args, {
        env: {
          ...process.env,
          OMEUMES_DB_PATH: path,
          OMEUMES_TEST_MODE: '1',
          OMEUMES_TEST_PORT: String(port),
          OMEUMES_TEST_TRANSITION: '',
          OMEUMES_BUILD_DIR: join(dirname(path), 'build'),
        },
        input: '\n',
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/por autorizar/);
      expect(files()).toEqual(before);
    }
  },
);
