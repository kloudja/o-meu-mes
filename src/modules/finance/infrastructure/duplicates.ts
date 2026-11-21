import { createHmac, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SpaceContext } from '../../spaces/access';
import type { Command, DuplicateNotice } from '../contracts/command';
import { canonical } from '../domain/actions';
import type { State } from '../domain/model';
import { activeEvents } from '../domain/projections';
import { DomainError } from '../domain/validation';
import { dependencies, duplicateDependencies, observedVersions } from './versions';

export class DuplicateError extends DomainError {
  constructor(public notice: DuplicateNotice) {
    super('DUPLICATE', 'Já existe um registo recente com o mesmo montante.');
  }
}
const processKey = randomBytes(32);

function windowMs() {
  const minutes = Number(process.env.OMEUMES_DUPLICATE_MINUTES ?? 5);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
    throw new Error('A janela de possíveis duplicados deve ter entre 1 e 1440 minutos.');
  return minutes * 60_000;
}

export function assertDistinct(
  db: DatabaseSync,
  ctx: SpaceContext,
  state: State,
  command: Command,
  key: Buffer = processKey,
  now = Date.now(),
) {
  const { action, period, duplicateConfirmation } = command;
  const month = state.months[period];
  if (!month) return;
  const line = action.type === 'execute' && month.lines.find((item) => item.id === action.lineId);
  const reserveId =
    action.type === 'save' ? action.reserveId : line && line.kind === 'saving' ? line.reserveId : undefined;
  const lineId = line && line.kind === 'expense' ? line.id : undefined;
  const requested =
    action.type === 'execute' && !action.total && !action.includedInTotal
      ? action.amount
      : action.type === 'save'
        ? action.amount
        : 0;
  if (!requested || (!lineId && !reserveId)) return;
  const matching = new Set(
    activeEvents(month)
      .filter((e) =>
        lineId
          ? e.type === 'execution' && e.lineId === lineId && e.amount === requested
          : (e.saving && e.saving.reserveId === reserveId && e.amount + e.saving.extra === requested) ||
            (e.type === 'execution' &&
              e.line?.kind === 'saving' &&
              e.line.reserveId === reserveId &&
              e.amount === requested),
      )
      .map((e) => e.id),
  );
  const entries: DuplicateNotice['entries'] = db
    .prepare(`
    SELECT e.id,e.AddedAt,e.payload,u.first_name,u.last_name
    FROM events e LEFT JOIN users u ON u.id=e.author_id
    WHERE e.space_id=? AND e.period=? AND e.IsDeleted=0 AND e.author_id IS NOT NULL AND e.AddedAt>=? AND e.AddedAt<=?
    ORDER BY e.AddedAt DESC,e.rowid DESC
  `)
    .all(ctx.spaceId, period, new Date(now - windowMs()).toISOString(), new Date(now).toISOString())
    .filter((row) => matching.has(String(row.id)))
    .slice(0, 5)
    .map((row) => {
      const data = JSON.parse(String(row.payload));
      return {
        id: String(row.id),
        amount: requested,
        date: data.date,
        description: data.description || data.line?.name || data.note,
        author: row.first_name === null ? null : `${row.first_name} ${row.last_name}`,
        createdAt: String(row.AddedAt),
        sourceNames: data.sourceNames ?? {},
      };
    });
  const versions = observedVersions(db, ctx, [
    ...dependencies(action, period, state),
    ...duplicateDependencies(period, lineId, reserveId),
  ]);
  const token = createHmac('sha256', key)
    .update(
      canonical({
        purpose: 'finance-duplicate-v2',
        user: ctx.userId,
        space: ctx.spaceId,
        period,
        action,
        versions,
        entries,
      }),
    )
    .digest('hex');
  if ((entries.length || duplicateConfirmation) && duplicateConfirmation !== token)
    throw new DuplicateError({ token, entries });
}
