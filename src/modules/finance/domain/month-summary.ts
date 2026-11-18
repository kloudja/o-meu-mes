import { aid, rid, type State, type Month, type Line } from './model';
import { balance, pending, plannedSource, obligations } from './projections';
import { knownBankAvailability } from './funding';
import { sum, subtotal } from './validation';

// The dashboard shows known subtotals even when another account or line has a missing value.
export function monthSummary(s: State, m: Month) {
  const monthAccounts = s.accounts
    .filter((a) => !a.restricted && !a.archived)
    .map((account) => {
      const source = aid(account.id),
        current = balance(m, source),
        remaining = obligations(m, source);
      return {
        account,
        current,
        forecast: current === null || remaining === null ? null : current - remaining,
      };
    });
  const balancesKnown = monthAccounts.flatMap(({ current }) => (current === null ? [] : [current]));
  const currentTotal = balancesKnown.length ? sum(balancesKnown) : null;
  const expenseGroups = new Map<string, { line: Line; amount: number | null }[]>();
  for (const line of m.lines.filter((l) => l.kind === 'expense')) {
    const amount = pending(m, line);
    if (amount === 0) continue;
    const source = plannedSource(line);
    const known = line.reserveId
      ? s.reserves.some((r) => rid(r.id) === source)
      : s.accounts.some((a) => aid(a.id) === source);
    const key = known ? source : '';
    const group = expenseGroups.get(key) ?? [];
    group.push({ line, amount });
    expenseGroups.set(key, group);
  }
  const expenses = subtotal([...expenseGroups.values()].flatMap((rows) => rows.map(({ amount }) => amount)));
  const forecast = knownBankAvailability(s, m, false);
  const savingCommitments = m.lines
    .filter((l) => l.kind === 'saving' || l.kind === 'investment')
    .map((line) => ({ line, amount: pending(m, line) }))
    .filter(({ amount }) => amount !== 0);
  const savings = subtotal(savingCommitments.map(({ amount }) => amount));
  return { monthAccounts, balancesKnown, currentTotal, expenseGroups, expenses, forecast, savingCommitments, savings };
}
