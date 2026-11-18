import type { Confirmed } from './command';

export function financialExport({ state, revision }: Confirmed, exportedAt: string) {
  const { accounts, categories, reserves, base, recurring, months } = state;
  return {
    format: 'o-meu-mes-export',
    version: 1,
    exportedAt,
    currency: 'EUR',
    moneyUnit: 'cent',
    revision,
    accounts,
    categories,
    reserves,
    base,
    recurring,
    months,
  };
}
