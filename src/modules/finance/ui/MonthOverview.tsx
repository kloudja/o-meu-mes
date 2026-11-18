import { monthSummary } from '../domain/month-summary';
import { useEffect, useRef, type CSSProperties } from 'react';
import { type Kind, type Month, type State, type Reserve } from '../domain/model';
import { accountFunding, reserveFunding } from '../domain/funding';
import { dateLabel, calendarDate, money } from '../domain/money';
import { advanceReminders } from '../domain/reminders';
import type { Screen } from '../i18n/pt-PT';
import { Icon } from '../../../shared/ui/Icon';
import { MonthFunding } from './MonthFunding';
import { BudgetRemainders } from './BudgetRemainders';
import { accountColor, isLongAmount } from './amount-display';

type Metric = 'balance' | 'expenses' | 'savings';
interface Props {
  state: State;
  month: Month;
  disabled: boolean;
  expandedMetric: Metric | null;
  setExpandedMetric: (metric: Metric | null) => void;
  sourceName: (id: string) => string;
  reserveLabel: (reserve: Reserve) => string;
  reserveWarningText: (row: ReturnType<typeof reserveFunding>[number]) => string;
  navigate: (next: Screen, target?: string, block?: ScrollLogicalPosition) => void;
  showPendingPlan: (kind: Kind) => void;
  onSnapshot: () => void;
}
export function MonthOverview({
  state: s,
  month: m,
  disabled,
  expandedMetric,
  setExpandedMetric,
  sourceName,
  reserveLabel,
  reserveWarningText,
  navigate,
  showPendingPlan,
  onSnapshot,
}: Props) {
  const hasInvestment = m.lines.some((line) => line.kind === 'investment');
  const funding = accountFunding(s, m);
  const showReserve = (id: string) => navigate('savings', 'reserve-' + id);
  const expandedMetricSlot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expandedMetric) return;
    const closeOutside = (e: PointerEvent) => {
      if (!expandedMetricSlot.current?.contains(e.target as Node)) setExpandedMetric(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [expandedMetric, setExpandedMetric]);
  const forecastLabel = hasInvestment
    ? 'Após despesas, reforços e investimentos previstos'
    : 'Após despesas e reforços previstos';
  const {
    monthAccounts,
    balancesKnown,
    currentTotal,
    expenseGroups,
    expenses,
    forecast,
    savingCommitments,
    savings,
  } = monthSummary(s, m);
  const upcomingReminders = advanceReminders(s.recurring, m.period, calendarDate());
  return (
    <>
      <section className="metrics" aria-label="Resumo mensal">
        {(
          [
            {
              label: 'Saldo atual das contas',
              amount: currentTotal,
              caption: 'Contas à ordem ativas',
              coverage: balancesKnown.length,
              cause: monthAccounts.length ? 'Há saldos por indicar.' : 'Sem contas à ordem ativas.',
              key: 'balance',
              destination: 'Abrir saldos em Contas',
              go: () => navigate('accounts', 'bank-accounts-title'),
            },
            {
              label: 'Despesas por pagar',
              ...expenses,
              caption: 'Inclui despesas a pagar por poupanças',
              cause: 'Há despesas com valor por indicar.',
              key: 'expenses',
              destination: 'Abrir despesas por pagar no plano',
              go: () => showPendingPlan('expense'),
            },
            {
              label: hasInvestment ? 'Poupanças e investimentos' : 'Poupanças',
              ...savings,
              caption: 'Reforços que ainda faltam',
              cause: 'Há montantes por indicar.',
              key: 'savings',
              destination: 'Abrir reforços planeados em Poupanças',
              go: () => navigate('savings', 'planned-savings-title'),
            },
            {
              label: 'Saldo previsto',
              amount: forecast.amount,
              caption: forecastLabel,
              coverage: forecast.knownCount,
              cause: forecast.cause,
              destination: 'Abrir saldos previstos em Contas',
              go: () => navigate('accounts', 'bank-accounts-title'),
            },
          ] as const
        ).map(({ label, amount, caption, cause, destination, go, ...metric }, i) => {
          const key = 'key' in metric ? metric.key : undefined,
            coverage = 'coverage' in metric ? metric.coverage : undefined;
          const expanded = !!key && expandedMetric === key;
          const partial = amount !== null && 'missing' in metric && metric.missing > 0;
          const value = (
            <strong className={isLongAmount(amount) ? 'long-amount' : undefined}>
              {amount === null ? 'Por apurar' : money(amount)}
            </strong>
          );
          return (
            <div
              className="metric-slot"
              key={label}
              ref={expanded ? expandedMetricSlot : undefined}
              onBlur={(e) => {
                if (expanded && !e.currentTarget.contains(e.relatedTarget)) setExpandedMetric(null);
              }}
              onKeyDown={(e) => {
                if (expanded && e.key === 'Escape') {
                  e.preventDefault();
                  e.currentTarget
                    .querySelector<HTMLButtonElement>('.metric-toggle')
                    ?.focus({ preventScroll: true });
                  setExpandedMetric(null);
                }
              }}
            >
              <article className={`metric ${i === 3 ? 'featured' : ''}`}>
                <div className="metric-heading">
                  <h2 className="metric-title">{label}</h2>
                  <button
                    className="icon-button metric-arrow"
                    aria-label={destination}
                    title={destination}
                    onClick={go}
                  >
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
                {partial ? (
                  <div className="subtotal-amount">
                    {value}
                    <span className="subtotal-tag">Ainda há valores por apurar</span>
                  </div>
                ) : (
                  value
                )}
                <small>{caption}</small>
                {amount === null || partial ? (
                  <small>{cause}</small>
                ) : (
                  coverage !== undefined &&
                  coverage < monthAccounts.length && (
                    <small>
                      Ainda há valores por apurar · {coverage} de {monthAccounts.length} contas
                    </small>
                  )
                )}
                {key && (
                  <button
                    className="text-button metric-toggle"
                    aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalhe: ${label}`}
                    aria-expanded={expanded}
                    aria-controls={`metric-${key}`}
                    onClick={() => setExpandedMetric(expanded ? null : key)}
                  >
                    {expanded ? 'Ocultar detalhe' : 'Ver detalhe'} <Icon name="chevron" size={15} />
                  </button>
                )}
              </article>
              {key && (
                <div
                  className="metric-detail"
                  id={`metric-${key}`}
                  hidden={!expanded}
                  tabIndex={0}
                  role="region"
                  aria-label={`Detalhe: ${label}`}
                >
                  {key === 'balance' ? (
                    <>
                      <p>
                        {balancesKnown.length} de {monthAccounts.length} contas com saldo conhecido.
                      </p>
                      <dl>
                        {monthAccounts.map(({ account, current }) => (
                          <div key={account.id}>
                            <dt>{account.name}</dt>
                            <dd>{current === null ? 'Saldo por indicar' : money(current)}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : key === 'savings' ? (
                    savingCommitments.length ? (
                      <>
                        <dl>
                          {savingCommitments.map(({ line, amount }) => (
                            <div key={line.id}>
                              <dt>{line.name}</dt>
                              <dd>{amount === null ? 'Valor por apurar' : money(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                        {hasInvestment && (
                          <button
                            className="text-button metric-toggle"
                            onClick={() => showPendingPlan('investment')}
                          >
                            Ver investimentos no plano
                            <Icon name="arrow" size={15} />
                          </button>
                        )}
                      </>
                    ) : (
                      <p>Sem reforços ou investimentos por realizar.</p>
                    )
                  ) : expenseGroups.size === 0 ? (
                    <p>Sem despesas por pagar.</p>
                  ) : (
                    Array.from(expenseGroups, ([source, rows]) => (
                      <div key={source}>
                        <h3>{source ? sourceName(source) : 'Origem por apurar'}</h3>
                        <dl>
                          {rows.map(({ line, amount }) => (
                            <div key={line.id}>
                              <dt>{line.name}</dt>
                              <dd>{amount === null ? 'Valor por apurar' : money(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
      {funding && (
        <MonthFunding
          key={m.period}
          month={m}
          report={funding}
          reserveLabel={reserveLabel}
          reserveWarningText={reserveWarningText}
          onReviewTransfers={() => navigate('accounts', 'funding-launch', 'nearest')}
          onOpenReserve={showReserve}
        />
      )}
      <div className="month-summary-panels">
        <BudgetRemainders month={m} onOpenSavings={() => navigate('savings')} />
        <section className="panel" aria-labelledby="month-accounts-title">
          <div className="section-top">
            <h2 id="month-accounts-title">Saldos atuais e previstos</h2>
            <Icon name="accounts" size={18} />
          </div>
          <p className="account-summary-caption">
            Contas à ordem ativas. O saldo previsto desconta as saídas ainda planeadas.
          </p>
          <div className="account-mini-list">
            {monthAccounts.length === 0 && <p className="tiny">Sem contas à ordem ativas.</p>}
            {monthAccounts.map(({ account, current, forecast }) => (
              <article
                className={`account-mini${[current, forecast].some(isLongAmount) ? ' wide-amounts' : ''}`}
                key={account.id}
                style={{ '--account-accent': accountColor(account.color) } as CSSProperties}
              >
                <h3>{account.name}</h3>
                <dl>
                  {[
                    { label: 'Atual', amount: current },
                    { label: 'Previsto', amount: forecast },
                  ].map(({ label, amount }) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd
                        className={amount === null ? 'balance-unknown' : amount < 0 ? 'negative' : undefined}
                      >
                        {money(amount)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <button className="text-button panel-link" onClick={() => navigate('accounts')}>
            Ver contas
            <Icon name="arrow" size={16} />
          </button>
        </section>
        {upcomingReminders.length > 0 && (
          <section className="panel advance-reminders" aria-labelledby="advance-reminders-title">
            <div className="section-top">
              <h2 id="advance-reminders-title">Lembretes de pagamentos</h2>
              <Icon name="bell" size={18} />
            </div>
            <ul>
              {upcomingReminders.map((item) => (
                <li key={item.id}>
                  <strong>{item.text}</strong>
                  <small>
                    {item.name} · pagamento a {dateLabel(item.date)}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="plan-bar" id="initial-plan">
        <div>
          <span>
            <strong>
              {m.snapshot
                ? `Plano inicial guardado · ${dateLabel(m.snapshot.date)}`
                : 'Plano inicial ainda não guardado'}
            </strong>
            <small>Referência para comparar com o plano atual.</small>
          </span>
        </div>
        <button className="text-button" disabled={disabled || !!m.snapshot} onClick={onSnapshot}>
          {m.snapshot ? 'Referência preservada' : 'Guardar plano inicial'}
        </button>
      </div>
    </>
  );
}
