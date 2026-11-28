import { useEffect, useState, type ReactNode } from 'react';
import { rid, type Month, type Category, type Event } from '../domain/model';
import { activeEvents, reversedIds } from '../domain/projections';
import { dateLabel, money } from '../domain/money';
import { recordedAt } from './MovementNotices';
export function HistoryDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{title}</summary>
      {open && children}
    </details>
  );
}
type Detail = {
  id: string;
  note: string;
  sourceNames?: Record<string, string>;
  author?: string | null;
  createdAt?: string | null;
};
interface Props {
  owner: string;
  space: string;
  month: Month;
  categories: Category[];
  source?: string;
  lineId?: string;
  focusedEvent?: string;
  sourceName: (id: string) => string;
  disabled: boolean;
  readOnly: boolean;
  accountHistory?: boolean;
  onVoid: (id: string, message: string) => void;
  onCorrect: (event: Event) => void;
}
export function MovementHistory({
  month: m,
  owner,
  space,
  categories,
  source,
  lineId,
  focusedEvent,
  sourceName,
  disabled,
  readOnly,
  accountHistory,
  onVoid,
  onCorrect,
}: Props) {
  const reversed = reversedIds(m);
  const replacements = new Set(m.events.flatMap((e) => (e.corrects ? [e.corrects] : [])));
  const [order, setOrder] = useState<'movement' | 'registration'>('movement');
  const events = m.events.filter((e) =>
    lineId
      ? e.lineId === lineId
      : source &&
        (e.deltas[source] != null ||
          e.reconciliation?.source === source ||
          (e.type === 'saving' && e.complete && e.line?.reserveId && source === rid(e.line.reserveId)) ||
          (!!e.savingParentId &&
            m.events.some((parent) => parent.id === e.savingParentId && parent.deltas[source] > 0))),
  );
  if (accountHistory) {
    events.reverse().sort((a, b) => {
      if (order === 'registration') {
        const byRegistration = (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        if (byRegistration) return byRegistration;
      }
      return b.date.localeCompare(a.date);
    });
  }
  const pageSize = 20;
  const [start, setStart] = useState(() =>
    Math.max(0, Math.floor(events.findIndex((e) => e.id === focusedEvent) / pageSize) * pageSize),
  );
  const pageStart = Math.min(start, Math.max(0, Math.floor((events.length - 1) / pageSize) * pageSize));
  const rows = events.slice(pageStart, pageStart + pageSize);
  const params = new URLSearchParams({ spaceId: space, period: m.period });
  for (const item of rows) params.append('eventId', item.id);
  const url = rows.length ? '/api/history?' + params : '';
  const [details, setDetails] = useState<{ url: string; entries: Detail[]; error?: boolean }>({
    url: '',
    entries: [],
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { cache: 'no-store', headers: { 'X-Account': owner }, signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 403 && !controller.signal.aborted) {
            const failure = await r.json();
            if (controller.signal.aborted) return;
            if (failure.code === 'SPACE_ACCESS')
              window.dispatchEvent(
                new CustomEvent('omeumes.spaceAccess', { detail: { space, code: failure.code } }),
              );
            else window.dispatchEvent(new Event('omeumes.access'));
          }
          throw new Error();
        }
        const data: { entries: Detail[] } = await r.json();
        if (!controller.signal.aborted) setDetails({ url, entries: data.entries });
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetails({ url, entries: [], error: true });
      });
    return () => controller.abort();
  }, [url, owner, attempt]);
  if (!events.length) return <p className="empty-history">Ainda sem registos neste mês.</p>;
  return (
    <>
      {accountHistory && (
        <label className="account-history-order">
          Ordenar por
          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value === 'registration' ? 'registration' : 'movement');
              setStart(0);
            }}
          >
            <option value="movement">Data do movimento (mais recente primeiro)</option>
            <option value="registration">Data de registo (mais recente primeiro)</option>
          </select>
        </label>
      )}
      <div className={accountHistory ? 'history account-history-rows' : 'history'}>
        {details.url === url && details.error && (
          <p role="alert">
            Falha ao consultar o histórico.{' '}
            <button onClick={() => setAttempt((n) => n + 1)}>Tentar novamente</button>
          </p>
        )}
        {rows.map((base) => {
          const e = {
            ...base,
            ...(details.url === url ? details.entries.find((d) => d.id === base.id) : undefined),
          };
          const expenseLine =
            source?.startsWith('a:') && e.lineId
              ? (e.line ??
                m.lines.find((l) => l.id === e.lineId) ??
                m.removedLines?.find((l) => l.id === e.lineId))
              : undefined;
          const expense = expenseLine?.kind === 'expense' ? expenseLine : undefined;
          const category = expense && categories.find((c) => c.id === expense.categoryId)?.name;
          const reconciliation = e.reconciliation;
          const isAmountUpdate = !!reconciliation || e.type === 'adjustment';
          const adjustment = isAmountUpdate && source ? e.deltas[source] : undefined;
          const showNote = isAmountUpdate
            ? e.note && e.note !== e.description
            : expense
              ? e.type === 'total' || e.type === 'detail'
              : e.description;
          const datePrefix = isAmountUpdate
            ? 'Data da atualização · '
            : expense && e.type === 'execution'
              ? 'Data da despesa · '
              : 'Data do movimento · ';
          const inactive = e.voided || reversed.has(e.id);
          const corrected = replacements.has(e.id);
          const canCorrect =
            ['execution', 'total', 'adjustment', 'transfer', 'detail', 'saving'].includes(e.type) &&
            !m.events.some(
              (entry) => entry.saving?.transferId === e.id && !reversed.has(entry.id) && !entry.voided,
            );
          return (
            <div
              className={[inactive && 'voided', isAmountUpdate && 'history-amount-update']
                .filter(Boolean)
                .join(' ')}
              key={e.id}
              tabIndex={focusedEvent === e.id ? -1 : undefined}
              data-initial-focus={focusedEvent === e.id ? true : undefined}
            >
              <div>
                <strong>
                  {e.reverses
                    ? e.historical
                      ? 'Compensação de anulação histórica'
                      : 'Compensação'
                    : isAmountUpdate
                      ? 'Atualização de montante'
                      : e.description || expense?.name || e.note}
                </strong>
                {isAmountUpdate && e.description && <small>{e.description}</small>}
                {expense && e.description && e.description !== expense.name && <small>{expense.name}</small>}
                {category && <small>{category}</small>}
                {showNote && <small>{e.note}</small>}
                <small>
                  {accountHistory && datePrefix}
                  <time dateTime={e.date}>{dateLabel(e.date)}</time>
                  {inactive ? (corrected ? ' · Corrigido' : ' · Anulado') : ''}
                  {e.corrects ? ' · Registo de substituição' : ''}
                  {lineId && e.type === 'total'
                    ? ' · ajuste, sem nova compra'
                    : e.type === 'detail'
                      ? ' · já incluída, sem novo gasto'
                      : ''}
                </small>
                {accountHistory && (
                  <small>
                    Data de registo ·{' '}
                    {e.createdAt ? (
                      <time dateTime={e.createdAt}>{recordedAt(e.createdAt)}</time>
                    ) : (
                      'Indisponível'
                    )}
                  </small>
                )}
                {(e.authorship === 'unknown' || e.author) && (
                  <small>
                    {e.author ? `Registado por ${e.author}` : 'Autoria histórica não disponível'}
                    {!accountHistory && e.createdAt && ` · ${recordedAt(e.createdAt)}`}
                  </small>
                )}
                {e.historical && <small>Instante da anulação histórica indisponível</small>}
                {e.saving && (
                  <small>
                    {money(e.amount)} para o objetivo · {money(e.saving.extra)} de reforço extra
                    {e.saving.transferId ? ' · Com transferência própria associada' : ''}
                  </small>
                )}
                {e.savingParentId && <small>{money(e.amount)} associados · Sem alteração aos saldos</small>}
                {isAmountUpdate && (
                  <>
                    <dl className="history-amounts">
                      <div>
                        <dt>Montante anterior</dt>
                        <dd>{reconciliation?.calculated == null ? 'Indisponível' : money(reconciliation.calculated)}</dd>
                      </div>
                      <div>
                        <dt>Montante final</dt>
                        <dd>{reconciliation?.observed == null ? 'Indisponível' : money(reconciliation.observed)}</dd>
                      </div>
                    </dl>
                    {adjustment != null && <small>Diferença aplicada ao saldo · {money(adjustment)}</small>}
                  </>
                )}
                {!isAmountUpdate && Object.keys(e.deltas).length > 0 && (
                  <small>
                    {Object.entries(e.deltas)
                      .map(
                        ([key, delta]) =>
                          `${key.startsWith('r:') ? sourceName(key) : (e.sourceNames?.[key] ?? sourceName(key))}: ${delta > 0 ? '+' : ''}${money(delta)}`,
                      )
                      .join(' · ')}
                  </small>
                )}
                {!!e.reserveShortfall?.unassigned && <small>{money(e.reserveShortfall.unassigned)} por atribuir a uma origem</small>}
                {!isAmountUpdate && (
                  <span>
                    {money(
                      lineId
                        ? (e.purchaseAmount ?? e.amount)
                        : source
                          ? (e.deltas[source] ?? e.amount)
                          : e.amount,
                    )}
                  </span>
                )}
              </div>
              {!readOnly && !inactive && !e.reverses && (
                <div className="history-actions">
                  {canCorrect && (
                    <button
                      className="text-button"
                      disabled={disabled || details.url !== url || details.error}
                      onClick={() => onCorrect(e)}
                    >
                      Corrigir
                    </button>
                  )}
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
                </div>
              )}
            </div>
          );
        })}
        {events.length > pageSize && (
          <div className="auth-actions">
            <button className="button" disabled={!pageStart} onClick={() => setStart(pageStart - pageSize)}>
              Anterior
            </button>
            <span>
              {pageStart + 1}–{pageStart + rows.length} de {events.length}
            </span>
            <button
              className="button"
              disabled={pageStart + rows.length >= events.length}
              onClick={() => setStart(pageStart + pageSize)}
            >
              Seguinte
            </button>
          </div>
        )}
      </div>
    </>
  );
}
