import { chooseDate } from './calendar';
import type { Locator } from '@playwright/test';
import { aid, rid } from '../../src/modules/finance/domain/model';
import { activeEvents, balance, realized } from '../../src/modules/finance/domain/projections';
import type { Confirmed } from '../../src/modules/finance/contracts/command';
import { expect, test } from './application';
import { goToScreen } from './navigation';

const period = '2026-11';
const bank = { id: 'activo', name: 'ActivoBank', restricted: false, color: '#7a9c8c' };
const reserve = { id: 'jogo', name: 'Jogo', accountId: bank.id };
const expense = {
  id: 'comprar-jogo', name: 'Comprar jogo', kind: 'expense',
  plan: 5000, accountId: bank.id, categoryId: '', reserveId: reserve.id,
} as const;
const goal = {
  ...expense, id: 'reforcar-jogo', name: 'Reforçar Jogo', kind: 'saving',
} as const;
const reinforced = 'Reforçado para o objetivo este mês';
const spent = 'Gasto a partir desta poupança';
const returned = 'Devolvido à conta';
const euros = (amount: string) => `${amount}\u00a0€`;
const value = (where: Locator, label: string) =>
  where.getByText(label, { exact: true }).locator('..').locator('dd');

for (const { width, paid, remaining } of [
  { width: 1366, paid: '50,00', remaining: '0,00' },
  { width: 360, paid: '30,00', remaining: '20,00' },
]) {
  test(`reforçar e pagar com dinheiro reservado — ${paid} € a ${width} px`, async ({ page, finance }, info) => {
    await finance.setup([
      { type: 'month', period },
      { type: 'account', account: bank },
      { type: 'reserve', reserve },
      { type: 'line', line: goal },
      { type: 'line', line: expense },
      { type: 'initial', source: aid(bank.id), amount: 100000 },
      { type: 'initial', source: rid(reserve.id), amount: 0 },
    ], period);
    await page.setViewportSize({ width, height: 840 });
    await page.goto('/');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await expect(page.getByLabel('Mês selecionado')).toHaveValue(period);

    const dialog = page.getByRole('dialog');
    const savingCard = page.locator('.savings-card').filter({ has: page.getByRole('heading', { name: 'Jogo', exact: true }) });
    const accountCard = page.locator('.account-card').filter({ has: page.getByText(bank.name, { exact: true }) });
    const expenseRow = page.getByTestId(`line-${expense.id}`);
    const goalRow = page.getByTestId(`line-${goal.id}`);

    async function expectBalances(account: string, forecast: string, available: string, saved: string, cost: string, refund = '0,00') {
      await goToScreen(page, 'Contas');
      await expect(accountCard.locator('.balance-value')).toHaveText(euros(account));
      await expect(value(accountCard, 'Saldo previsto')).toHaveText(euros(forecast));
      await goToScreen(page, 'Poupanças');
      await expect(savingCard.getByText('Saldo disponível na poupança', { exact: true })).toBeVisible();
      await expect(savingCard.locator('.balance-value')).toHaveText(euros(available));
      await expect(value(savingCard, reinforced)).toHaveText(euros(saved));
      await expect(value(savingCard, spent)).toHaveText(euros(cost));
      await expect(value(savingCard, returned)).toHaveText(euros(refund));
      await goToScreen(page, 'Plano e movimentos');
      await page.getByRole('tab', { name: 'Despesas' }).click();
      await expect(expenseRow.locator('.realized')).toHaveText(`Realizado${euros(cost)}`);
    }

    await expectBalances('1.000,00', '950,00', '0,00', '0,00', '0,00');
    await goToScreen(page, 'Poupanças');
    await savingCard.getByRole('button', { name: 'Poupar', exact: true }).click();
    await expect(dialog.getByLabel('Montante (€)', { exact: true })).toHaveValue('50,00');
    await chooseDate(dialog, `${period}-01`);
    await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expectBalances('950,00', '950,00', '50,00', '50,00', '0,00');

    const pay = expenseRow.getByRole('button', { name: 'Pagar com Jogo', exact: true });
    await expect(pay).toBeVisible();
    await expenseRow.screenshot({ path: info.outputPath(`pagar-${width}.png`) });
    if (paid === '50,00') {
      await page.clock.setFixedTime(new Date(`${period}-04T12:00:00Z`));
      // Keep session expiry and request timeouts on the real clock.
      await page.evaluate(() => { Date.now = () => Math.floor(performance.timeOrigin + performance.now()); });
      await pay.click();
      await expect(expenseRow).toContainText('Concluída');
    } else {
      await expenseRow.getByRole('button', { name: 'Detalhe de Comprar jogo' }).click();
      await dialog.getByRole('button', { name: 'Parcial ou diferente' }).click();
      const source = dialog.getByLabel('Origem do dinheiro', { exact: true });
      await expect(source).toHaveValue('Poupança · Jogo (ActivoBank)');
      await source.fill(bank.name);
      await dialog.getByRole('option', { name: bank.name, exact: true }).click();
      await expect(source).toHaveValue(bank.name);
      await source.fill(reserve.name);
      await dialog.getByRole('option', { name: 'Poupança · Jogo (ActivoBank)', exact: true }).click();
      await chooseDate(dialog, `${period}-04`);
      await dialog.getByLabel('Montante (€)', { exact: true }).fill(paid);
      await dialog.getByRole('button', { name: 'Confirmar registo' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(expenseRow).toContainText('Parcial');
    }
    await expect(expenseRow.locator('time')).toHaveAttribute('datetime', `${period}-04`);
    await expectBalances('950,00', '950,00', remaining, '50,00', paid);

    await page.getByRole('tab', { name: 'Poupanças' }).click();
    await expect(page.locator('.plan-total')).toContainText('Reforços previstos');
    await expect(page.locator('.plan-total')).toContainText(euros('50,00'));
    await goalRow.getByRole('button', { name: 'Detalhe de Reforçar Jogo' }).click();
    await expect(value(dialog, reinforced)).toHaveText(euros('50,00'));
    await expect(value(dialog, 'Falta poupar')).toHaveText(euros('0,00'));
    await page.keyboard.press('Escape');
    await goToScreen(page, 'Poupanças');
    await savingCard.screenshot({ path: info.outputPath(`poupanca-${width}.png`) });

    if (paid === '30,00') {
      await goToScreen(page, 'Contas');
      await page.getByRole('button', { name: 'Transferir entre contas' }).click();
      await dialog.getByLabel('Origem', { exact: true }).fill(reserve.name);
      await dialog.getByRole('option', { name: 'Poupança · Jogo (ActivoBank)', exact: true }).click();
      await dialog.getByLabel('Destino', { exact: true }).fill(bank.name);
      await dialog.getByRole('option', { name: bank.name, exact: true }).click();
      await dialog.getByLabel('Montante (€)', { exact: true }).fill('10');
      await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expectBalances('960,00', '960,00', '10,00', '50,00', '30,00', '10,00');

      await goToScreen(page, 'Poupanças');
      await savingCard.getByText('Histórico da poupança', { exact: true }).click();
      const transfer = savingCard.locator('.history > div').filter({ hasText: 'Transferência própria' });
      await transfer.getByRole('button', { name: 'Corrigir', exact: true }).click();
      await dialog.getByLabel('Montante (€)', { exact: true }).fill('5');
      await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(value(savingCard, returned)).toHaveText(euros('5,00'));
      await expect(value(savingCard, spent)).toHaveText(euros('30,00'));
      await transfer.getByRole('button', { name: 'Anular', exact: true }).click();
      await expectBalances('950,00', '950,00', '20,00', '50,00', '30,00');

      await expenseRow.getByRole('button', { name: 'Detalhe de Comprar jogo' }).click();
      await dialog.getByRole('button', { name: 'Corrigir', exact: true }).click();
      await dialog.getByLabel('Montante (€)', { exact: true }).fill('35');
      await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expectBalances('950,00', '950,00', '15,00', '50,00', '35,00');
      await expenseRow.getByRole('button', { name: 'Detalhe de Comprar jogo' }).click();
      await dialog.getByRole('button', { name: 'Anular', exact: true }).click();
      await expect(value(dialog, 'Realizado')).toHaveText(euros('0,00'));
      await page.keyboard.press('Escape');
      await expectBalances('950,00', '950,00', '50,00', '50,00', '0,00');
    }
  });
}

test('origens concretas e nomes compridos a 360 px', async ({ page, finance }, info) => {
  const longReserve = {
    ...reserve, name: 'Poupança de longo prazo para a revisão anual e manutenção extraordinária',
  };
  await finance.setup([
    { type: 'month', period },
    { type: 'account', account: bank },
    { type: 'reserve', reserve: longReserve },
    { type: 'line', line: expense },
    { type: 'line', line: { ...expense, id: 'via-banco', name: 'Pagamento pela conta', reserveId: undefined } },
    { type: 'line', line: { ...expense, id: 'sem-origem', name: 'Pagamento sem origem', accountId: '', reserveId: undefined } },
    { type: 'initial', source: aid(bank.id), amount: 100000 },
  ], period);
  await page.setViewportSize({ width: 360, height: 840 });
  await page.goto('/');
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  await expect(page.getByLabel('Mês selecionado')).toHaveValue(period);
  await goToScreen(page, 'Poupanças');
  const card = page.locator('.savings-card');
  await expect(card.getByText('Estimativa por confirmar', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Introduzir Total Acumulado da Poupança' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Total que vê hoje no banco (€)', { exact: true }).fill('100');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(card.getByText('Estimativa por confirmar', { exact: true })).toHaveCount(0);

  await goToScreen(page, 'Plano e movimentos');
  const row = page.getByTestId(`line-${expense.id}`);
  const pay = row.getByRole('button', { name: `Pagar com ${longReserve.name}`, exact: true });
  await expect(pay).toBeVisible();
  const textFits = await pay.evaluate(button => {
    const bounds = button.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(button);
    const lines = [...text.getClientRects()];
    return bounds.height >= 44 && lines.length > 1 && lines.every(rect =>
      rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom);
  });
  expect(textFits).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await row.screenshot({ path: info.outputPath('origem-comprida-360.png') });
  await expect(page.getByTestId('line-via-banco').getByRole('button', { name: 'Pagar com ActivoBank', exact: true })).toBeVisible();
  await page.getByTestId('line-sem-origem').getByRole('button', { name: 'Pagar', exact: true }).click();
  await expect(dialog.getByLabel('Origem do dinheiro', { exact: true })).toHaveValue('');
});

for (const funding of ['poupança', 'conta', 'por atribuir', 'segunda origem por confirmar', 'saldo desconhecido'] as const) {
  test(`despesa de 35 € com 31 € na poupança — ${funding}`, async ({ page, finance }, info) => {
    const otherBank = { ...bank, id: 'outra-conta', name: 'Banco Secundário' };
    const otherReserve = { id: 'outra-poupanca', name: 'Férias de teste', accountId: otherBank.id };
    const fuel = { ...reserve, name: 'Gasolina de teste' };
    const purchase = { ...expense, name: 'Abastecimento de teste', plan: 3500 };
    const first = rid(fuel.id);
    const other = funding === 'poupança' ? rid(otherReserve.id) : aid(otherBank.id);
    const onAccount = funding === 'conta' || funding === 'segunda origem por confirmar';
    await finance.setup([
      { type: 'month', period },
      { type: 'account', account: bank },
      { type: 'account', account: otherBank },
      { type: 'reserve', reserve: fuel },
      { type: 'reserve', reserve: otherReserve },
      { type: 'line', line: purchase },
      { type: 'initial', source: aid(bank.id), amount: 10000 },
      { type: 'initial', source: rid(otherReserve.id), amount: 600 },
      ...(funding === 'saldo desconhecido' ? [] : [
        { type: 'initial' as const, source: first, amount: 3100 },
      ]),
      ...(funding === 'saldo desconhecido' || funding === 'segunda origem por confirmar' ? [] : [
        { type: 'initial' as const, source: aid(otherBank.id), amount: 1000 },
      ]),
    ], period);
    if (funding === 'por atribuir') await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await goToScreen(page, 'Plano e movimentos');
    const row = page.getByTestId(`line-${purchase.id}`);
    const dialog = page.getByRole('dialog');
    await row.getByRole('button', { name: /^Pagar/ }).click();
    const confirm = dialog.getByRole('button', { name: /Confirmar/ });
    const second = dialog.getByRole('combobox', { name: 'Segunda origem' });
    const readMonth = async () => {
      const result: Confirmed = await (await finance.read(period)).json();
      return result.state.months[period];
    };

    if (funding === 'saldo desconhecido') {
      await expect(second).toHaveCount(0);
      await confirm.click();
      await expect(dialog.getByRole('alert')).toContainText('O saldo estimado não cobre o débito');
      const before = await readMonth();
      expect(before.events).toEqual([]);
      expect(balance(before, first)).toBeNull();
      await dialog.getByLabel('Quanto ficou na poupança após a despesa? (€)').fill('0');
      await confirm.click();
      await expect(dialog).toHaveCount(0);
      const saved = await readMonth();
      expect(saved.events).toHaveLength(1);
      expect(saved.events[0].deltas).toEqual({ [first]: -3500 });
      expect(saved.events[0].reserveShortfall).toBeUndefined();
      return;
    }

    const split = dialog.getByRole('group', { name: 'Repartição da despesa' });
    await expect(split).toContainText('35,00');
    await expect(split).toContainText('31,00');
    await expect(split).toContainText('4,00');
    await confirm.click();
    await expect(second).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('alert')).toContainText('Escolha outra origem');
    const label = funding === 'poupança' ? /Férias de teste/ : onAccount
      ? 'Banco Secundário' : 'Prosseguir sem segunda origem';
    await second.fill(funding === 'poupança' ? 'ferias' : onAccount ? 'secundario' : 'sem segunda');
    await split.getByRole('option', { name: label, exact: typeof label === 'string' }).click();
    if (funding === 'segunda origem por confirmar') {
      const initial = dialog.getByLabel('Saldo inicial — Banco Secundário (€)', { exact: true });
      await confirm.click();
      await expect(initial).toHaveAttribute('aria-invalid', 'true');
      await initial.fill('3');
      await confirm.click();
      await expect(dialog.getByRole('alert')).toContainText(/3,00.*4,00/);
      expect((await readMonth()).events).toEqual([]);
      expect(balance(await readMonth(), other)).toBeNull();
      await initial.fill('10');
    }
    await split.screenshot({ path: info.outputPath('reparticao-despesa.png') });
    await confirm.dblclick();
    await expect(dialog).toHaveCount(0);
    await expect(row.locator('.realized')).toContainText('35,00');
    let saved = await readMonth();
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]).toMatchObject({
      amount: 3500,
      deltas: funding === 'por atribuir' ? { [first]: -3100 } : { [first]: -3100, [other]: -400 },
      reserveShortfall: { source: first, unassigned: funding === 'por atribuir' ? 400 : 0 },
    });
    expect(realized(saved, purchase.id)).toBe(3500);
    expect(balance(saved, first)).toBe(0);
    expect(balance(saved, other)).toBe(funding === 'poupança' ? 200 : onAccount ? 600 : 1000);
    expect(balance(saved, aid(bank.id))).toBe(10000);

    await page.reload();
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await goToScreen(page, 'Mês');
    const monthSummary = page.getByRole('region', { name: 'Resumo mensal' });
    await expect(monthSummary.locator('.metric').filter({ hasText: 'Despesas por pagar' }).locator('strong')).toHaveText(euros('0,00'));
    await expect(monthSummary.locator('.metric').filter({ hasText: 'Saldo atual das contas' }).locator('strong'))
      .toHaveText(euros(onAccount ? '106,00' : '110,00'));
    if (funding === 'por atribuir') await expect(page.getByText(/4,00.*em despesas por atribuir/)).toBeVisible();
    await goToScreen(page, 'Plano e movimentos');
    const detail = row.getByRole('button', { name: `Detalhe de ${purchase.name}` });
    await detail.click();
    const history = dialog.locator('.history');
    await expect(history).toContainText(/Gasolina de teste.*31,00/);
    await expect(history).toContainText(funding === 'por atribuir' ? /4,00.*por atribuir/ :
      funding === 'poupança' ? /Férias de teste.*4,00/ : /Banco Secundário.*4,00/);
    await dialog.screenshot({ path: info.outputPath('historico-despesa.png') });

    await dialog.getByRole('button', { name: 'Corrigir', exact: true }).click();
    await dialog.getByLabel('Montante (€)', { exact: true }).fill('33');
    await expect(split).toContainText('31,00');
    await expect(split).toContainText('2,00');
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    saved = await readMonth();
    expect(saved.events).toHaveLength(3);
    expect(activeEvents(saved)).toHaveLength(1);
    expect(realized(saved, purchase.id)).toBe(3300);
    expect(activeEvents(saved)[0].deltas).toEqual(funding === 'por atribuir'
      ? { [first]: -3100 } : { [first]: -3100, [other]: -200 });
    expect(activeEvents(saved)[0].reserveShortfall?.unassigned).toBe(funding === 'por atribuir' ? 200 : 0);
    await detail.click();
    await dialog.getByRole('button', { name: 'Anular', exact: true }).click();
    await expect(value(dialog, 'Realizado')).toHaveText(euros('0,00'));
    saved = await readMonth();
    expect(activeEvents(saved)).toHaveLength(0);
    expect(balance(saved, first)).toBe(3100);
    expect(balance(saved, rid(otherReserve.id))).toBe(600);
    expect(balance(saved, aid(otherBank.id))).toBe(1000);
  });
}
