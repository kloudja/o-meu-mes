import type { DatabaseSync } from 'node:sqlite';
import type { SpaceContext } from '../../spaces/access';
import { canonical, type Action } from '../domain/actions';
import type { State } from '../domain/model';
import { activeEvents } from '../domain/projections';
import { DomainError } from '../domain/validation';

const key = (...parts: string[]) => canonical(parts);
const lineKey = (period: string, id: string) => key(period, 'line', id);
const executionKey = (period: string, id: string) => key(period, 'execution', id);
const manualKey = (period: string, id: string) => key(period, 'manual', id);
const eventKey = (period: string, id: string) => key(period, 'event', id);
const sourceKey = (period: string, id: string) => key(period, 'source', id);
const reserveKey = (period: string, id: string) => key(period, 'reserve', id);

export function dependencies(action: Action, period: string, state: State): string[] {
  const catalog = (type: string, id?: string) => (id ? [key(type, id)] : []);
  const origin = (id: string) => catalog(id.startsWith('r:') ? 'reserve' : 'account', id.slice(2));
  const lineCatalog = (line: { accountId: string; categoryId?: string; reserveId?: string }) => [
    ...catalog('account', line.accountId),
    ...catalog('category', line.categoryId),
    ...catalog('reserve', line.reserveId),
  ];
  const m = state.months[period];
  switch (action.type) {
    case 'month':
      return [];
    case 'snapshot':
      return [key(period, 'plan'), key('catalog')];
    case 'execute': {
      const line = m?.lines.find((l) => l.id === action.lineId);
      return [
        lineKey(period, action.lineId),
        manualKey(period, action.lineId),
        ...origin(action.source),
        ...(line ? lineCatalog(line) : []),
        ...(action.total || action.remaining || action.complete ? [executionKey(period, action.lineId)] : []),
        ...(action.includedInTotal ? [eventKey(period, action.includedInTotal)] : []),
      ];
    }
    case 'save':
      return [
        ...origin(action.source),
        ...catalog('reserve', action.reserveId),
        ...(action.lineId
          ? [
              lineKey(period, action.lineId),
              ...(action.complete ? [executionKey(period, action.lineId)] : []),
            ]
          : []),
      ];
    case 'associateSaving':
      return [lineKey(period, action.lineId), eventKey(period, action.eventId)];
    case 'transfer':
      return [...origin(action.source), ...origin(action.destination)];
    case 'initial':
    case 'reconcile':
      return [...origin(action.source), sourceKey(period, action.source)];
    case 'line':
      return [
        ...lineCatalog(action.line),
        ...(action.execution ? origin(action.execution.source) : []),
        ...(action.target === 'base'
          ? [key('base', action.line.id)]
          : [lineKey(period, action.line.id), executionKey(period, action.line.id)]),
      ];
    case 'removeLine':
      return action.target === 'base'
        ? [key('base', action.id)]
        : [lineKey(period, action.id), executionKey(period, action.id)];
    case 'correct':
    case 'void': {
      const event = m?.events.find((e) => e.id === action.id);
      return [
        eventKey(period, action.id),
        ...(event?.lineId ? [lineKey(period, event.lineId)] : []),
        ...(action.type === 'correct' ? dependencies(action.replacement, period, state) : []),
      ];
    }
    case 'occurrence':
      return [
        key(period, 'occurrence', action.id),
        ...(action.lineId
          ? [key(period, 'occurrence-link', action.lineId), lineKey(period, action.lineId)]
          : []),
      ];
    case 'recordSuggestedTransfers':
      return []; // The engine compares the full recalculated routes.
    case 'account':
      return catalog('account', action.account.id);
    case 'deleteAccount':
      return catalog('account', action.id);
    case 'category':
      return catalog('category', action.category.id);
    case 'reserve':
      return [...catalog('reserve', action.reserve.id), ...lineCatalog(action.reserve)];
    case 'recurring':
      return [...catalog('recurring', action.definition.id), ...lineCatalog(action.definition)];
  }
}

export function duplicateDependencies(period: string, lineId?: string, reserveId?: string) {
  return reserveId ? [reserveKey(period, reserveId)] : lineId ? [executionKey(period, lineId)] : [];
}

export const executionChanged = (
  db: DatabaseSync,
  ctx: SpaceContext,
  period: string,
  lineId: string,
  observed: number,
) => observedVersions(db, ctx, [executionKey(period, lineId)])[0] > observed;

function resources(state: State, period: string) {
  const values = new Map<string, unknown>();
  const catalog = (type: string, entries: { id: string }[]) => {
    for (const entry of entries) values.set(key(type, entry.id), entry);
  };
  catalog('account', state.accounts);
  catalog('category', state.categories);
  catalog('reserve', state.reserves);
  catalog('base', state.base);
  catalog('recurring', state.recurring);
  values.set(key('catalog'), [state.accounts, state.categories, state.reserves]);
  const month = state.months[period];
  if (!month) return values;
  values.set(key(period, 'plan'), [month.lines, month.occurrences]);
  for (const line of month.lines) values.set(lineKey(period, line.id), line);
  for (const item of month.occurrences) {
    values.set(key(period, 'occurrence', item.id), item);
    if (item.lineId) values.set(key(period, 'occurrence-link', item.lineId), item.id);
  }
  const add = (id: string, value: unknown) => {
    const prior = values.get(id) as unknown[] | undefined;
    if (prior) prior.push(value);
    else values.set(id, [value]);
  };
  for (const [source, initial] of Object.entries(month.initials))
    if (initial !== null) add(sourceKey(period, source), initial);
  for (const entry of activeEvents(month)) {
    add(eventKey(period, entry.id), entry.id);
    if (entry.lineId) {
      add(executionKey(period, entry.lineId), entry.id);
      if (entry.type === 'total') add(manualKey(period, entry.lineId), entry.id);
    }
    for (const id of [
      entry.savingParentId,
      entry.saving?.transferId,
      ...Object.keys(entry.allocations ?? {}),
    ])
      if (id) add(eventKey(period, id), entry.id);
    for (const [source, delta] of Object.entries(entry.deltas)) {
      if (delta) add(sourceKey(period, source), [entry.id, delta]);
      if (source.startsWith('r:') && delta) add(reserveKey(period, source.slice(2)), [entry.id, delta]);
    }
    const reserve =
      entry.saving?.reserveId ?? (entry.line?.kind === 'saving' ? entry.line.reserveId : undefined);
    if (reserve) add(reserveKey(period, reserve), entry.id);
  }
  return values;
}

export function updateVersions(
  db: DatabaseSync,
  ctx: SpaceContext,
  period: string,
  previous: State,
  next: State,
  revision: number,
) {
  const before = resources(previous, period);
  const after = resources(next, period);
  const record = db.prepare(`INSERT INTO finance_versions VALUES(?,?,?)
    ON CONFLICT(space_id,resource) DO UPDATE SET revision=excluded.revision`);
  for (const resource of new Set([...before.keys(), ...after.keys()]))
    if (canonical(before.get(resource)) !== canonical(after.get(resource)))
      record.run(ctx.spaceId, resource, revision);
}

export function observedVersions(db: DatabaseSync, ctx: SpaceContext, keys: string[]) {
  const read = db.prepare('SELECT revision FROM finance_versions WHERE space_id=? AND resource=?');
  return [...new Set(keys)].sort().map((resource) => Number(read.get(ctx.spaceId, resource)?.revision ?? 0));
}

export function assertObservation(
  db: DatabaseSync,
  ctx: SpaceContext,
  state: State,
  action: Action,
  period: string,
  observed: number,
  current: number,
  start: number,
) {
  const conflict = () =>
    new DomainError('CONFLICT', 'Os dados foram atualizados. Reveja os valores antes de confirmar.');
  if (observed > current) throw conflict();
  const keys = dependencies(action, period, state);
  if (
    keys.length &&
    (observed < start || observedVersions(db, ctx, keys).some((version) => version > observed))
  )
    throw conflict();
}
