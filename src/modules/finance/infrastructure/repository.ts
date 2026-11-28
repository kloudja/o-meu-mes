import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SpaceContext } from '../../spaces/access';
import { requireWrite } from '../../spaces/access';
import { canonical } from '../domain/actions';
import { transact } from '../domain/engine';
import { pending } from '../domain/projections';
import { DomainError, validDate } from '../domain/validation';
import type { Command, Confirmed } from '../contracts/command';
import { load, persist, retire } from './state-tables';
import { receipt, updateRequest } from './requests';
import { assertObservation, executionChanged, updateVersions } from './versions';
import { assertDistinct } from './duplicates';
export type { Command, Confirmed } from '../contracts/command';

function revision(db: DatabaseSync, ctx: SpaceContext) {
  return Number(db.prepare('SELECT revision FROM meta WHERE space_id=?').get(ctx.spaceId)!.revision);
}
export function readMonth(db: DatabaseSync, ctx: SpaceContext, period?: string): Confirmed {
  const periods = db
    .prepare('SELECT period FROM months WHERE space_id=? AND IsDeleted=0 ORDER BY period')
    .all(ctx.spaceId)
    .map((r) => String(r.period));
  if (period && !periods.includes(period)) throw new DomainError('MONTH', 'Mês indisponível.');
  const state = load(db, ctx, period ?? periods.at(-1) ?? '', true);
  if (state.previousBalances)
    state.previousBalances.balances = Object.fromEntries(
      Object.entries(state.previousBalances.balances).filter(([source]) => source.startsWith('r:')),
    );
  // Amounts and allocations drive the selected month's projections. Historical
  // narratives and source labels are fetched only for the opened history page.
  for (const entry of state.months[state.selected]?.events ?? []) {
    entry.note = '';
    delete entry.sourceNames;
  }
  return { state, revision: revision(db, ctx), periods };
}
export function applyCommand(
  db: DatabaseSync,
  ctx: SpaceContext,
  c: Command,
  duplicateKey?: Buffer,
): Confirmed {
  requireWrite(ctx);
  const target = c.action.type === 'month' ? c.action.period : c.period;
  const existing = receipt(db, ctx, c.requestId);
  const sameKey = () =>
    new DomainError('IDEMPOTENCY', 'Esta referência já foi utilizada. Reveja a operação.');
  if (existing?.status === 'closed' || (existing && existing.period !== c.period)) throw sameKey();
  const version = existing?.status === 'confirmed' ? Number(existing.version) : 2;
  const fingerprint = createHash('sha256')
    .update(canonical({ period: c.period, action: c.action, duplicateConfirmation: c.duplicateConfirmation }))
    .digest('hex');
  if (existing?.status === 'confirmed') {
    if (existing.fingerprint !== fingerprint || ![1, 2].includes(version)) throw sameKey();
    return {
      ...readMonth(db, ctx, target),
      replay: true,
      resultId: existing.result_id === null ? undefined : String(existing.result_id),
    };
  }
  const historical = db
    .prepare(`SELECT scope,canonical FROM legacy_receipts
    WHERE space_id=? AND request_id=? AND EXISTS
    (SELECT 1 FROM legacy_assignment a WHERE a.space_id=legacy_receipts.space_id AND a.user_id=?)`)
    .all(ctx.spaceId, c.requestId, ctx.userId);
  if (historical.length) {
    const scope = c.action.type === 'month' ? 'open' : c.period;
    if (
      c.duplicateConfirmation ||
      !historical.some((r) => r.scope === scope && r.canonical === canonical(c.action))
    )
      throw sameKey();
    if (existing?.status === 'pending')
      db.prepare(`UPDATE receipts SET status='confirmed',fingerprint=?,version=2,
       ModifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE space_id=? AND user_id=? AND request_id=?`).run(
        fingerprint,
        ctx.spaceId,
        ctx.userId,
        c.requestId,
      );
    return { ...readMonth(db, ctx, target), replay: true };
  }
  const state = load(db, ctx, target);
  const month = state.months[target];
  const meta = db.prepare('SELECT revision,mu3_start FROM meta WHERE space_id=?').get(ctx.spaceId)!;
  const current = Number(meta.revision);
  const action = c.action;
  if (action.type === 'snapshot') validDate(action.date);
  const alreadySaved =
    (action.type === 'month' && !!month) || (action.type === 'snapshot' && !!month?.snapshot);
  let resultId: string | undefined;
  if (!alreadySaved) {
    assertObservation(db, ctx, state, action, target, c.revision, current, Number(meta.mu3_start));
    if (c.action.type !== 'month' && !state.selected)
      throw new DomainError('MONTH', 'Abra primeiro o mês pretendido.');
    if (
      month &&
      (action.type === 'execute' || action.type === 'save') &&
      action.lineId &&
      executionChanged(db, ctx, target, action.lineId, c.revision)
    ) {
      const line = month.lines.find((l) => l.id === action.lineId);
      const remaining = line && pending(month, line);
      if (line && !line.variable && remaining != null && action.amount > remaining)
        throw new DomainError(
          'CONFLICT',
          'O valor por realizar mudou. Reveja o movimento antes de confirmar.',
        );
    }
    // Receipts are user-scoped. Event identifiers are shared by the space.
    const collisions = month?.events.some((e) => e.id === c.requestId || e.id.startsWith(c.requestId + ':'));
    const group = collisions ? 'mu3-event:' + randomUUID() : c.requestId;
    let next: ReturnType<typeof transact>;
    try {
      next = transact(state, action, group);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'BATCH_CHANGED' && c.revision < current)
        throw new DomainError('CONFLICT', error.message);
      throw error;
    }
    assertDistinct(db, ctx, state, c, duplicateKey);
    if (c.action.type === 'deleteAccount') {
      retire(db, ctx, 'initials', 'source', 'a:' + c.action.id);
      retire(db, ctx, 'origins', 'id', 'a:' + c.action.id);
      retire(db, ctx, 'accounts', 'id', c.action.id);
    }
    persist(db, ctx, next);
    updateVersions(db, ctx, target, state, next, current + 1);
    db.prepare('UPDATE meta SET revision=revision+1 WHERE space_id=?').run(ctx.spaceId);
    if (next.months[target]?.events.some((event) => event.id === group || event.groupId === group))
      resultId = group;
  }
  if (!existing) updateRequest(db, ctx, 'prepare', c.requestId, c.period);
  db.prepare(
    `UPDATE receipts SET fingerprint=?,version=2,status='confirmed',result_revision=?,result_id=?,
    ModifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE space_id=? AND user_id=? AND request_id=?`,
  ).run(
    fingerprint,
    current + (alreadySaved ? 0 : 1),
    resultId ?? null,
    ctx.spaceId,
    ctx.userId,
    c.requestId,
  );
  return { ...readMonth(db, ctx, target), replay: alreadySaved, resultId };
}

export function historyDetails(db: DatabaseSync, ctx: SpaceContext, period: string, ids: string[]) {
  const entries = db
    .prepare(`SELECT e.id,json_extract(e.payload,'$.note') AS note,
    json_extract(e.payload,'$.sourceNames') AS names,u.first_name,u.last_name,
    CASE WHEN coalesce(json_extract(e.payload,'$.historical'),0)=0 AND e.author_id IS NOT NULL THEN e.AddedAt END AS created_at
    FROM events e LEFT JOIN users u ON u.id=e.author_id
    WHERE e.space_id=? AND e.period=? AND e.IsDeleted=0
    AND e.id IN (${ids.map(() => '?').join(',')}) ORDER BY e.rowid`)
    .all(ctx.spaceId, period, ...ids);
  return {
    entries: entries.map((r) => ({
      id: r.id,
      note: r.note,
      sourceNames: r.names ? JSON.parse(String(r.names)) : undefined,
      author: r.first_name === null ? null : `${r.first_name} ${r.last_name}`,
      createdAt: r.created_at,
    })),
  };
}
