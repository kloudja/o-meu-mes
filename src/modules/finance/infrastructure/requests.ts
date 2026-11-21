import type { DatabaseSync } from 'node:sqlite';
import type { SpaceContext } from '../../spaces/access';
import { DomainError, validId, validPeriod } from '../domain/validation';

export function receipt(db: DatabaseSync, ctx: SpaceContext, id: string) {
  return db
    .prepare(
      'SELECT period,status,fingerprint,version,result_id FROM receipts WHERE space_id=? AND user_id=? AND request_id=?',
    )
    .get(ctx.spaceId, ctx.userId, id);
}
// v4 keys were unique per period (or the month-opening scope).
export function legacyStatus(db: DatabaseSync, ctx: SpaceContext, id: string, period?: string) {
  const rows = db
    .prepare(`SELECT CASE WHEN scope='open' THEN json_extract(canonical,'$.period') ELSE scope END AS period
    FROM legacy_receipts WHERE space_id=? AND request_id=? AND
      EXISTS (SELECT 1 FROM legacy_assignment a WHERE a.space_id=legacy_receipts.space_id AND a.user_id=?) AND
      (? IS NULL OR scope=? OR
      (scope='open' AND json_extract(canonical,'$.period')=?)) ORDER BY scope LIMIT 2`)
    .all(ctx.spaceId, id, ctx.userId, period ?? null, period ?? null, period ?? null);
  return rows.length === 1 ? { requestId: id, period: rows[0].period, status: 'confirmed' } : null;
}
export function inbox(db: DatabaseSync, ctx: SpaceContext, id?: string, period?: string) {
  if (id) {
    validId(id);
    const r = receipt(db, ctx, id);
    return {
      request:
        r && (!period || r.period === period)
          ? { requestId: id, period: r.period, status: r.status }
          : legacyStatus(db, ctx, id, period),
    };
  }
  return {
    requests: db
      .prepare(`SELECT request_id AS requestId,period,status FROM receipts
    WHERE space_id=? AND user_id=? AND acknowledged=0 ORDER BY rowid LIMIT 25`)
      .all(ctx.spaceId, ctx.userId),
  };
}
export function updateRequest(
  db: DatabaseSync,
  ctx: SpaceContext,
  operation: 'prepare' | 'resolve' | 'ack',
  id: string,
  period: string,
) {
  validId(id);
  validPeriod(period);
  const row = receipt(db, ctx, id);
  const historical = legacyStatus(db, ctx, id, period);
  if (historical && (!row || row.period !== period)) return { request: historical };
  if (row && row.period !== period)
    throw new DomainError('IDEMPOTENCY', 'A confirmação pertence a outro mês.');
  const keys = [ctx.spaceId, ctx.userId, id];
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  if (!row && operation !== 'ack') {
    db.prepare('INSERT INTO receipts(space_id,user_id,request_id,period,status) VALUES(?,?,?,?,?)').run(
      ...keys,
      period,
      operation === 'prepare' ? 'pending' : 'closed',
    );
  } else if (row?.status === 'pending' && operation === 'resolve') {
    db.prepare(
      `UPDATE receipts SET status='closed',ModifiedAt=${now} WHERE space_id=? AND user_id=? AND request_id=?`,
    ).run(...keys);
  } else if (operation === 'ack' && row && row.status !== 'pending') {
    db.prepare(
      `UPDATE receipts SET acknowledged=1,ModifiedAt=${now} WHERE space_id=? AND user_id=? AND request_id=? AND acknowledged=0`,
    ).run(...keys);
  }
  return inbox(db, ctx, id);
}
