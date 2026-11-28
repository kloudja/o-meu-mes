import type { Kind } from '../domain/model';
export type Screen = 'month' | 'plan' | 'accounts' | 'savings' | 'recurring' | 'base' | 'settings';
export const navigation: { id: Screen; label: string; icon: string }[] = [
  { id: 'month', label: 'Mês', icon: 'month' },
  { id: 'plan', label: 'Plano e movimentos', icon: 'base' },
  { id: 'accounts', label: 'Contas', icon: 'accounts' },
  { id: 'savings', label: 'Poupanças', icon: 'savings' },
  { id: 'recurring', label: 'Pagamentos recorrentes', icon: 'recurring' },
  { id: 'base', label: 'Modelo Base', icon: 'base' },
  { id: 'settings', label: 'Definições', icon: 'settings' },
];
export const kindLabel: Record<Kind, string> = {
  expense: 'Despesas',
  income: 'Receitas mensais',
  saving: 'Reforços de poupança',
  investment: 'Investimentos',
};
export const monthKindLabel: Record<Kind, string> = {
  expense: 'Despesas',
  income: 'Receitas',
  saving: 'Poupanças',
  investment: 'Investimentos',
};
export const monthKindTotal: Record<Kind, string> = {
  expense: 'Total de despesas',
  income: 'Total de receitas previstas',
  saving: 'Reforços previstos',
  investment: 'Total de investimentos',
};
export const baseKinds: Kind[] = ['income', 'expense', 'saving'];
export const createLabel: Record<Kind, string> = {
  expense: 'Adicionar despesa ao plano',
  income: 'Adicionar receita ao plano',
  saving: 'Adicionar poupança ao mês',
  investment: 'Adicionar investimento',
};
export const noAccounts = 'Sem contas disponíveis';
export const screenDescriptions = {
  plan: 'Consulte o plano e registe o que já aconteceu.',
  accounts: 'Saldos atuais e compromissos por banco.',
  savings: 'Dinheiro separado por finalidade.',
  recurring: 'Lembretes para não deixar passar subscrições e obrigações.',
  base: 'O ponto de partida dos próximos meses.',
  settings: 'Contas, categorias e partilha deste espaço.',
};
