import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { State, Line, Event } from '../domain/model';

import { canonical } from '../domain/actions';
import { DomainError, sum } from '../domain/validation';
import { previousPeriod } from '../domain/projections';
import { requireWrite, type SpaceContext } from '../../spaces/access';

type Row = Record<string, SQLInputValue>;
const json = (v: unknown) => JSON.stringify(v);
const parse = (v: unknown) => JSON.parse(v as string);
const nullable = (s: string | undefined) => s || null;

// Only the server's domain result reaches this function. Each row is updated in place;
// no financial record is deleted, even when a line is removed or an event is voided.
export function persist(db: DatabaseSync, ctx: SpaceContext, s: State) {
  requireWrite(ctx);
  const upsert = (table: string, keys: string[], row: Row) => {
    keys = ['space_id', ...keys];
    row = { space_id: ctx.spaceId, ...row };
    const columns = Object.keys(row),
      values = Object.values(row);
    const existing = db
      .prepare(`SELECT * FROM ${table} WHERE ${keys.map((k) => `${k}=?`).join(' AND ')}`)
      .get(...keys.map((k) => row[k]));
    if (existing?.IsDeleted)
      throw new DomainError('ID', 'Este identificador pertence a um registo removido.');
    if (
      existing &&
      columns.every(
        (k) =>
          existing[k] === row[k] ||
          (k === 'payload' && canonical(parse(existing[k])) === canonical(parse(row[k]))),
      )
    )
      return;
    const updates = columns.filter((k) => !keys.includes(k));
    if (existing) {
      db.prepare(
        `UPDATE ${table} SET ${updates.map((k) => k + '=?').join(',')}, ModifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${keys.map((k) => k + '=?').join(' AND ')}`,
      ).run(...updates.map((k) => row[k]), ...keys.map((k) => row[k]));
    } else {
      if (table === 'events') {
        columns.push('author_id');
        values.push(ctx.userId);
      }
      db.prepare(
        `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
      ).run(...values);
    }
  };
  for (const a of s.accounts) {
    upsert('accounts', ['id'], { id: a.id, payload: json(a) });
    upsert('origins', ['id'], { id: `a:${a.id}`, account_id: a.id, reserve_id: null });
  }
  for (const c of s.categories) upsert('categories', ['id'], { id: c.id, payload: json(c) });
  for (const r of s.reserves) {
    upsert('reserves', ['id'], { id: r.id, account_id: r.accountId, payload: json(r) });
    upsert('origins', ['id'], { id: `r:${r.id}`, account_id: null, reserve_id: r.id });
  }
  const lineRow = (l: Line) => {
    const { plan, ...metadata } = l;
    return {
      id: l.id,
      account_id: nullable(l.accountId),
      category_id: nullable(l.categoryId),
      reserve_id: nullable(l.reserveId),
      plan,
      payload: json(metadata),
    };
  };
  for (const r of db.prepare('SELECT id FROM base_lines WHERE space_id=? AND IsDeleted=0').all(ctx.spaceId))
    if (!s.base.some((l) => l.id === r.id)) retire(db, ctx, 'base_lines', 'id', String(r.id));
  for (const l of s.base) upsert('base_lines', ['id'], lineRow(l));
  for (const r of s.recurring) {
    const { amount, ...metadata } = r;
    upsert('recurring', ['id'], {
      id: r.id,
      account_id: nullable(r.accountId),
      reserve_id: nullable(r.reserveId),
      amount,
      payload: json(metadata),
    });
  }

  const origins = [...s.accounts.map((a) => `a:${a.id}`), ...s.reserves.map((r) => `r:${r.id}`)];
  for (const m of Object.values(s.months)) {
    const period = m.period;
    upsert('months', ['period'], { period });
    for (const source of origins)
      upsert('initials', ['period', 'source'], { period, source, amount: m.initials[source] ?? null });
    for (const l of m.lines) upsert('lines', ['period', 'id'], { period, ...lineRow(l), removed: 0 });
    for (const l of m.removedLines ?? [])
      upsert('lines', ['period', 'id'], { period, ...lineRow(l), removed: 1 });
    if (m.snapshot) upsert('snapshots', ['period'], { period, format: 1, payload: json(m.snapshot) });

    for (const e of m.events) {
      const {
        authorship: _authorship,
        amount,
        purchaseAmount,
        corrects,
        replacedBy,
        deltas,
        allocations,
        reconciliation,
        totalObservation,
        ...metadata
      } = e;
      upsert('events', ['period', 'id'], {
        period,
        id: e.id,
        line_id: e.lineId ?? null,
        amount,
        purchase_amount: purchaseAmount ?? null,
        corrects: corrects ?? null,
        replaced_by: replacedBy ?? null,
        payload: json(metadata),
      });
      for (const [source, delta] of Object.entries(deltas))
        upsert('effects', ['period', 'event_id', 'source'], { period, event_id: e.id, source, delta });
      if (reconciliation)
        upsert('observations', ['period', 'event_id'], {
          period,
          event_id: e.id,
          source: reconciliation.source,
          observed: reconciliation.observed,
          calculated: reconciliation.calculated,
          purchases: null,
        });
      if (totalObservation)
        upsert('observations', ['period', 'event_id'], {
          period,
          event_id: e.id,
          source: null,
          observed: totalObservation.observed,
          calculated: totalObservation.realizedBefore,
          purchases: totalObservation.purchasesBefore,
        });
    }
    // Parents may have been inserted later in the array; both sides exist now.
    for (const e of m.events)
      for (const [parent, amount] of Object.entries(e.allocations ?? {}))
        upsert('allocations', ['period', 'event_id', 'parent_id'], {
          period,
          event_id: e.id,
          parent_id: parent,
          amount,
        });
    for (const o of m.occurrences) {
      const { amount, ...metadata } = o;
      upsert('occurrences', ['period', 'id'], {
        period,
        id: o.id,
        definition_id: o.definitionId,
        line_id: o.lineId ?? null,
        amount,
        payload: json(metadata),
      });
    }
  }
}

export function retire(
  db: DatabaseSync,
  ctx: SpaceContext,
  table: 'base_lines' | 'accounts' | 'origins' | 'initials',
  field: 'id' | 'source',
  id: string,
) {
  requireWrite(ctx);
  db.prepare(
    `UPDATE ${table} SET IsDeleted=1, ModifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), DeletedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE space_id=? AND ${field}=? AND IsDeleted=0`,
  ).run(ctx.spaceId, id);
}

export function load(db: DatabaseSync, ctx: SpaceContext, period: string): State {
  const all = (t: string, monthly = false) =>
    db
      .prepare(
        `SELECT * FROM ${t} WHERE space_id=? AND IsDeleted=0 ${monthly ? 'AND period=?' : ''} ORDER BY rowid`,
      )
      .all(ctx.spaceId, ...(monthly ? [period] : []));
  const s: State = {
    accounts: all('accounts').map((r) => parse(r.payload)),
    categories: all('categories').map((r) => parse(r.payload)),
    reserves: all('reserves').map((r) => parse(r.payload)),
    base: all('base_lines').map((r) => ({ ...parse(r.payload), plan: r.plan })),
    recurring: all('recurring').map((r) => ({ ...parse(r.payload), amount: r.amount })),
    selected: '',
    months: {},
    requests: {},
  };
  for (const r of all('months', true)) {
    const p = r.period as string;
    s.months[p] = { period: p, lines: [], removedLines: [], initials: {}, events: [], occurrences: [] };
  }
  const month = (r: Record<string, unknown>) => s.months[r.period as string];
  for (const r of all('lines', true))
    (r.removed ? month(r).removedLines! : month(r).lines).push({ ...parse(r.payload), plan: r.plan });
  for (const r of all('initials', true)) month(r).initials[r.source as string] = r.amount as number | null;
  for (const r of all('snapshots', true)) month(r).snapshot = parse(r.payload);
  const events = new Map<string, Event>();
  const event = (r: Record<string, unknown>) => events.get(String(r.event_id))!;
  for (const r of all('events', true)) {
    const e: Event = {
      ...parse(r.payload),
      amount: r.amount,
      deltas: {},
      authorship: r.author_id === null ? 'unknown' : undefined,
    };
    if (r.purchase_amount !== null) e.purchaseAmount = r.purchase_amount as number;
    if (r.corrects !== null) e.corrects = r.corrects as string;
    if (r.replaced_by !== null) e.replacedBy = r.replaced_by as string;
    month(r).events.push(e);
    events.set(e.id, e);
  }
  for (const r of all('effects', true)) event(r).deltas[r.source as string] = r.delta as number;
  for (const r of all('allocations', true))
    (event(r).allocations ??= {})[r.parent_id as string] = r.amount as number;
  for (const r of all('observations', true)) {
    if (r.source !== null)
      event(r).reconciliation = {
        source: r.source as string,
        observed: r.observed as number,
        calculated: r.calculated as number,
      };
    else
      event(r).totalObservation = {
        observed: r.observed as number,
        realizedBefore: r.calculated as number,
        purchasesBefore: r.purchases as number,
      };
  }
  for (const r of all('occurrences', true))
    month(r).occurrences.push({ ...parse(r.payload), amount: r.amount });
  s.selected = s.months[period] ? period : '';
  s.usedAccounts = db
    .prepare(`SELECT DISTINCT account_id AS id FROM lines WHERE space_id=? AND account_id IS NOT NULL
    UNION SELECT substr(source,3) FROM initials WHERE space_id=? AND source LIKE 'a:%' AND amount IS NOT NULL
    UNION SELECT substr(source,3) FROM effects WHERE space_id=? AND source LIKE 'a:%'
    UNION SELECT account_id FROM occurrences WHERE space_id=? AND account_id IS NOT NULL
    UNION SELECT json_extract(l.value,'$.accountId') FROM snapshots s,json_each(s.payload,'$.lines') l WHERE space_id=?
    UNION SELECT line_account FROM events WHERE space_id=? AND line_account IS NOT NULL
    UNION SELECT substr(source,3) FROM observations WHERE space_id=? AND source LIKE 'a:%'`)
    .all(...Array(7).fill(ctx.spaceId))
    .flatMap((r) => (r.id ? [String(r.id)] : []));
  if (period) {
    const previous = previousPeriod(period);
    const balances = db
      .prepare('SELECT source,amount FROM initials WHERE space_id=? AND period=? AND IsDeleted=0')
      .all(ctx.spaceId, previous);
    const deltas = new Map<string, number[]>();
    for (const row of db
      .prepare(`SELECT f.source, f.delta FROM effects f
      JOIN events e ON (e.space_id,e.period,e.id)=(f.space_id,f.period,f.event_id)
      WHERE f.space_id=? AND f.period=? AND f.IsDeleted=0 AND e.IsDeleted=0`)
      .all(ctx.spaceId, previous)) {
      const source = String(row.source);
      const amounts = deltas.get(source);
      if (amounts) amounts.push(Number(row.delta));
      else deltas.set(source, [Number(row.delta)]);
    }
    s.previousBalances = {
      period: previous,
      balances: Object.fromEntries(
        balances.map((r) => [
          String(r.source),
          r.amount === null ? null : sum([Number(r.amount), ...(deltas.get(String(r.source)) ?? [])]),
        ]),
      ),
    };
  }
  return s;
}
