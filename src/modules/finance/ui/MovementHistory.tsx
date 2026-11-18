import { rid, type Month, type Category } from '../domain/model';
import { activeEvents } from '../domain/projections';
import { dateLabel, money } from '../domain/money';
interface Props {
  month: Month;
  categories: Category[];
  source?: string;
  lineId?: string;
  focusedEvent?: string;
  sourceName: (id: string) => string;
  disabled: boolean;
  onVoid: (id: string, message: string) => void;
}
export function MovementHistory({
  month: m,
  categories,
  source,
  lineId,
  focusedEvent,
  sourceName,
  disabled,
  onVoid,
}: Props) {
  const events = m.events.filter((e) =>
    lineId
      ? e.lineId === lineId
      : source &&
        (e.deltas[source] != null ||
          (e.type === 'saving' && e.complete && e.line?.reserveId && source === rid(e.line.reserveId)) ||
          (!!e.savingParentId &&
            m.events.some((parent) => parent.id === e.savingParentId && parent.deltas[source] > 0))),
  );
  if (!events.length) return <p className="empty-history">Ainda sem registos neste mês.</p>;
  return (
    <div className="history">
      {events.map((e) => {
        const expenseLine =
          source?.startsWith('a:') && e.lineId
            ? (e.line ??
              m.lines.find((l) => l.id === e.lineId) ??
              m.removedLines?.find((l) => l.id === e.lineId))
            : undefined;
        const expense = expenseLine?.kind === 'expense' ? expenseLine : undefined;
        const category = expense && categories.find((c) => c.id === expense.categoryId)?.name;
        return (
          <div
            className={e.voided ? 'voided' : ''}
            key={e.id}
            tabIndex={focusedEvent === e.id ? -1 : undefined}
            data-initial-focus={focusedEvent === e.id ? true : undefined}
          >
            <div>
              <strong>{e.description || expense?.name || e.note}</strong>
              {expense && e.description && e.description !== expense.name && <small>{expense.name}</small>}
              {category && <small>{category}</small>}
              {(expense ? e.type === 'total' || e.type === 'detail' : e.description) && (
                <small>{e.note}</small>
              )}
              <small>
                {dateLabel(e.date)}
                {e.voided ? ' · Anulado' : ''}
                {lineId && e.type === 'total'
                  ? ' · ajuste, sem nova compra'
                  : e.type === 'detail'
                    ? ' · já incluída, sem novo gasto'
                    : ''}
              </small>
              {e.saving && (
                <small>
                  {money(e.amount)} para o objetivo · {money(e.saving.extra)} de reforço extra
                  {e.saving.transferId ? ' · Com transferência própria associada' : ''}
                </small>
              )}
              {e.savingParentId && <small>{money(e.amount)} associados · Sem alteração aos saldos</small>}
              {Object.keys(e.deltas).length > 0 && (
                <small>
                  {Object.entries(e.deltas)
                    .map(
                      ([key, delta]) =>
                        `${key.startsWith('r:') ? sourceName(key) : (e.sourceNames?.[key] ?? sourceName(key))}: ${delta > 0 ? '+' : ''}${money(delta)}`,
                    )
                    .join(' · ')}
                </small>
              )}
              <span>
                {money(
                  lineId
                    ? (e.purchaseAmount ?? e.amount)
                    : source
                      ? (e.deltas[source] ?? e.amount)
                      : e.amount,
                )}
              </span>
            </div>
            {!e.voided && (
              <button
                className="text-button danger"
                disabled={disabled}
                onClick={() =>
                  onVoid(
                    e.id,
                    e.saving?.transferId || activeEvents(m).some((x) => x.saving?.transferId === e.id)
                      ? 'Transferência e reforço anulados. Os saldos foram atualizados.'
                      : 'Registo anulado. Os valores foram atualizados.',
                  )
                }
              >
                Anular
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
