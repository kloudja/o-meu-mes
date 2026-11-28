import { expect, test } from './application';
import { goToScreen } from './navigation';
import type { State } from '../../src/modules/finance/domain/model';

test('receitas mensais entram no plano e cada mês começa com o saldo calculado do anterior', async ({ page, finance, openExamples }) => {
  await openExamples(page);
  const dialog = page.getByRole('dialog');
  async function openMonth(period: string) {
    await page.getByRole('button', { name: 'Novo mês', exact: true }).click();
    await dialog.getByLabel('Mês', { exact: true }).fill(period);
    await dialog.getByRole('button', { name: 'Abrir mês', exact: true }).click();
    await expect(page.getByLabel('Mês selecionado')).toHaveValue(period);
  }

  await goToScreen(page, 'Plano e movimentos');
  await page.getByTestId('line-rent').getByRole('button', { name: 'Pagar com ActivoBank A', exact: true }).click();
  await expect(page.getByTestId('line-rent')).toContainText('Concluída');
  await goToScreen(page, 'Modelo Base');
  await expect(page.getByRole('heading', { name: 'Receitas mensais', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saldos iniciais das contas' })).toHaveCount(0);
  await openMonth('2026-12');
  await goToScreen(page, 'Contas');
  const account = page.getByRole('article').filter({ hasText: 'ActivoBank A' });
  await expect(account.getByText('Saldo inicial', { exact: true }).locator('..')).toContainText('865,00');
  await expect(account.locator('.balance-value')).toContainText('865,00');
  await goToScreen(page, 'Plano e movimentos');
  await page.getByRole('tab', { name: /Receitas/ }).click();
  const income = page.getByTestId('line-income');
  await expect(income).toContainText('1.200,00');
  await income.getByRole('button', { name: 'Receber', exact: true }).click();
  await expect(income).toContainText('Concluído');

  await openMonth('2027-01');
  await openMonth('2027-03');
  await openMonth('2026-12');
  async function month(period: string) {
    const { state }: { state: State } = await (await finance.read(period)).json();
    expect(Object.keys(state.months)).toEqual([period]);
    return state.months[period];
  }
  expect((await month('2026-11')).initials['a:act-r']).toBe(95000);
  expect((await month('2026-12')).initials).toMatchObject({ 'a:act-r': 86500, 'a:act-s': 25000, 'r:em': null });
  expect((await month('2026-12')).events.map(event => event.amount)).toEqual([120000]);
  expect((await month('2027-01')).initials).toMatchObject({ 'a:act-r': 206500, 'a:bank': null, 'r:em': null });
  expect((await month('2027-01')).events).toEqual([]);
  expect((await month('2027-03')).initials['a:act-r']).toBeNull();
});
