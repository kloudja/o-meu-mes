import { expect, test } from './application';
import { goToScreen } from './navigation';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('pesquisa de conta e poupança com teclado, toque e cancelamento', async ({ page, openExamples, finance }, info) => {
  await openExamples(page);
  await page.getByLabel('Mês selecionado').click();
  await page.screenshot({ path: info.outputPath('seletor-mes.png') });
  await page.keyboard.press('Escape');
  await goToScreen(page, 'Plano e movimentos');
  await page.getByRole('button', { name: 'Adicionar despesa ao plano' }).click();
  const dialog = page.getByRole('dialog');
  const account = dialog.getByRole('combobox', { name: 'Banco de onde sai o dinheiro' });
  const saving = dialog.getByRole('combobox', { name: 'Poupança usada para pagar (opcional)' });
  await dialog.getByLabel('Nome', { exact: true }).fill('Despesa de teste dos seletores');
  await account.fill('moey! b');
  await account.press('ArrowDown');
  await expect(account).toBeFocused();
  await expect(account).toHaveCSS('outline-style', 'solid');
  await expect(account).toHaveAttribute('aria-activedescendant', /options/);
  await account.press('Enter');
  await expect(account).toHaveValue('Moey! B');

  await saving.fill('asdjkl');
  await expect(dialog.getByText('Sem resultados')).toBeVisible();
  await expect(dialog.getByRole('listbox').getByRole('option')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('seletor-sem-resultados.png') });
  await saving.press('Enter');
  await expect(dialog).toBeVisible();
  await saving.press('Escape');
  await expect(saving).toHaveValue('');
  await expect(saving).toBeFocused();
  await expect(saving).toHaveAttribute('aria-expanded', 'false');

  await saving.tap();
  await saving.fill('gasolina');
  const option = dialog.getByRole('option', { name: /Gasolina/ });
  await expect(option).toBeVisible();
  await page.screenshot({ path: info.outputPath('seletor-poupanca.png') });
  await option.tap();
  await expect(saving).toHaveValue(/Gasolina/);
  await account.fill('outro banco');
  await account.press('Escape');
  await expect(account).toHaveValue('Moey! B');
  await expect(saving).toHaveValue(/Gasolina/);
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const { state } = await (await finance.read('2026-11')).json();
  expect(state.months['2026-11'].lines.find((line: { name: string }) =>
    line.name === 'Despesa de teste dos seletores')).toMatchObject({ accountId: 'moey-s', reserveId: 'gas' });
  const archived = state.accounts.find((entry: { id: string }) => entry.id === 'moey-s');
  await finance.setup([{ type: 'account', account: { ...archived, archived: true } }], '2026-11');
  await page.reload();
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  await goToScreen(page, 'Plano e movimentos');
  await page.getByRole('button', { name: 'Detalhe de Despesa de teste dos seletores' }).click();
  await dialog.getByRole('button', { name: 'Editar plano atual' }).click();
  await expect(account).toHaveAttribute('required', '');
  await expect(account).toHaveValue('Moey! B');
  await expect(saving).toHaveValue(/Gasolina/);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
});
