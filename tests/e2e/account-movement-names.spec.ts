import { chooseDate } from './calendar';
import { expect, test } from './application';
import { goToScreen } from './navigation';

test('o histórico da conta distingue as datas da despesa e do registo', async ({ page, openExamples }, info) => {
  await openExamples(page);
  await goToScreen(page, 'Plano e movimentos');
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Detalhe de Seguro do Carro' }).click();
  await dialog.getByRole('button', { name: 'Parcial ou diferente' }).click();
  await dialog.getByLabel('Montante (€)', { exact: true }).fill('18');
  await dialog.getByRole('button', { name: 'Confirmar registo' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Detalhe de Comida' }).click();
  await dialog.getByRole('button', { name: 'Registar compra / total' }).click();
  await dialog.getByLabel('Nome da compra (opcional)').fill('Mercearia');
  await chooseDate(dialog, '2026-11-20');
  await dialog.getByLabel('Montante (€)', { exact: true }).fill('12');
  await dialog.getByRole('button', { name: 'Confirmar registo' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Detalhe de Comida' }).click();
  await dialog.getByRole('button', { name: 'Registar compra / total' }).click();
  await dialog.getByLabel('Nome da compra (opcional)').fill('Padaria');
  await chooseDate(dialog, '2026-11-03');
  await dialog.getByLabel('Montante (€)', { exact: true }).fill('5');
  await dialog.getByRole('button', { name: 'Confirmar registo' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await goToScreen(page, 'Contas');

  const santander = page.locator('.account-card').filter({ hasText: 'Santander' });
  const santanderHistory = santander.getByRole('button', { name: 'Ver movimentos da conta' });
  await santanderHistory.click();
  await expect(dialog).toHaveAccessibleName('Movimentos de Santander');
  const payment = dialog.locator('.history');
  await expect(payment.locator('strong')).toHaveText('Seguro do Carro');
  await expect(payment.getByText('Seguros', { exact: true })).toBeVisible();
  await expect(payment.getByText(/^-18,00/)).toBeVisible();
  await expect(payment).not.toContainText('Pagamento / compra');
  await page.screenshot({ path: info.outputPath('historico-conta-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(santanderHistory).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const activoBank = page.locator('.account-card').filter({ hasText: 'ActivoBank A' });
  await activoBank.getByRole('button', { name: 'Ver movimentos da conta' }).click();
  const purchases = dialog.locator('.history');
  await expect(purchases.locator('strong')).toHaveText(['Mercearia', 'Padaria']);
  await expect(purchases.getByText('Comida', { exact: true })).toHaveCount(2);
  await expect(purchases.getByText('Refeições/Supermercado', { exact: true })).toHaveCount(2);
  await expect(purchases.getByText('Data da despesa · 20/11/2026')).toBeVisible();
  await expect(purchases.locator('small').filter({ hasText: /Data de registo · \d/ })).toHaveCount(2);

  await dialog.getByLabel('Ordenar por').selectOption('registration');
  await expect(purchases.locator('strong')).toHaveText(['Padaria', 'Mercearia']);
  await page.screenshot({ path: info.outputPath('historico-conta-mobile.png') });
  await purchases.getByRole('button', { name: 'Corrigir' }).first().click();
  await expect(dialog).toHaveAccessibleName('Corrigir registo');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveAccessibleName('Movimentos de ActivoBank A');
});
