import { chooseDate } from './calendar';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from './application';
import { goToScreen } from './navigation';

test('histórico distingue atualizações de montante, transferência e total de compras', async ({
  application,
  finance,
  page,
}, info) => {
  const period = '2026-10';
  const source = 'a:act-r';
  const reserve = 'r:test-saving';
  const setup = await finance.setup(
    [
      { type: 'initial', source, amount: 9000 },
      { type: 'initial', source: 'a:act-s', amount: 0 },
      { type: 'reserve', reserve: { id: 'test-saving', name: 'Poupança fictícia', accountId: 'moey-r' } },
      { type: 'initial', source: reserve, amount: 0 },
      {
        type: 'line',
        line: {
          id: 'test-food',
          kind: 'expense',
          name: 'Compras fictícias',
          accountId: 'act-r',
          categoryId: 'cat-refeicoes',
          variable: true,
          plan: 3000,
        },
      },
      { type: 'reconcile', source, amount: 8000, date: period + '-01', note: 'Registo antigo fictício' },
      { type: 'execute', lineId: 'test-food', source, amount: 1000, date: period + '-02', total: true, complete: false },
      { type: 'transfer', source, destination: 'a:act-s', amount: 2000, date: period + '-03' },
    ],
    period,
  );
  const legacyId = setup.state.months[period].events[0].id;
  using db = new DatabaseSync(application.database, { timeout: 5000 });
  expect(db.prepare('DELETE FROM observations WHERE space_id=? AND event_id=?').run(finance.spaceId, legacyId).changes).toBe(1);

  await page.goto('/');
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Confirmar', exact: true });
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await goToScreen(page, 'Contas');
  const account = page.locator('.account-card').filter({ hasText: 'ActivoBank A' });
  await expect(account.locator('.balance-value')).toHaveText(/50,00\s*€/);
  await account.getByRole('button', { name: 'Atualizar montante', exact: true }).click();
  await dialog.getByLabel('Saldo observado no banco (€)').fill('40');
  await dialog.getByLabel('Motivo da diferença').fill('Conferência fictícia da conta');
  await chooseDate(dialog, period + '-04');
  await confirm.click();
  await expect(account.locator('.balance-value')).toHaveText(/40,00\s*€/);
  await expect(page.locator('.account-card').filter({ hasText: 'ActivoBank B' }).locator('.balance-value')).toHaveText(/20,00\s*€/);
  await account.getByRole('button', { name: 'Ver movimentos da conta' }).click();

  const rows = dialog.locator('.history > div');
  await expect(rows.locator('strong')).toHaveText([
    'Atualização de montante',
    'Transferência própria (sem receita nem despesa)',
    'Compras fictícias',
    'Atualização de montante',
  ]);
  await expect(rows.nth(0).locator('dt')).toHaveText(['Montante anterior', 'Montante final']);
  await expect(rows.nth(0).locator('dd')).toHaveText([/50,00\s*€/, /40,00\s*€/]);
  await expect(rows.nth(0)).toContainText(/Diferença aplicada ao saldo · -10,00\s*€/);
  await expect(rows.nth(0)).toContainText('Conferência fictícia da conta');
  await expect(rows.nth(2)).toContainText('Ajuste conciliado do total acumulado');
  await expect(rows.nth(3).locator('dd')).toHaveText(['Indisponível', 'Indisponível']);
  await expect(rows.nth(3)).toContainText('Registo antigo fictício');
  await expect(rows.nth(0).getByRole('button', { name: 'Corrigir' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('historico-conta-1366.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rows.nth(0).getByText('Montante final')).toBeInViewport();
  await page.screenshot({ path: info.outputPath('historico-conta-390.png') });
  await page.keyboard.press('Escape');

  await goToScreen(page, 'Poupanças');
  const savings = page.locator('#reserve-test-saving');
  await savings.getByRole('button', { name: 'Atualizar montante total poupado' }).click();
  await dialog.getByLabel('Total que vê hoje no banco (€)').fill('15');
  await confirm.click();
  await expect(savings.locator('.balance-value')).toHaveText(/15,00\s*€/);
  await savings.getByText('Histórico da poupança', { exact: true }).click();
  const savingUpdate = savings.locator('.history > div');
  await expect(savingUpdate.locator('strong')).toHaveText('Atualização de montante');
  await expect(savingUpdate.locator('dd')).toHaveText([/^0,00\s*€$/, /^15,00\s*€$/]);
  await expect(savingUpdate.getByRole('button', { name: 'Corrigir' })).toBeEnabled();
  await savingUpdate.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('historico-poupanca-390.png') });

  const confirmed = await (await finance.read(period)).json() as typeof setup;
  expect(confirmed.state.months[period].events.map(({ type, amount, deltas }) => [type, amount, deltas])).toEqual([
    ['adjustment', 0, { [source]: -1000 }],
    ['total', 1000, { [source]: -1000 }],
    ['transfer', 0, { [source]: -2000, 'a:act-s': 2000 }],
    ['adjustment', 0, { [source]: -1000 }],
    ['adjustment', 0, { [reserve]: 1500 }],
  ]);
});
