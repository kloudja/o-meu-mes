import { expect, test } from './application';
import { goToScreen } from './navigation';

test('o histórico da conta identifica pagamentos parciais e compras com nome', async ({ page, openExamples }, info) => {
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
  await dialog.getByLabel('Montante (€)', { exact: true }).fill('12');
  await dialog.getByRole('button', { name: 'Confirmar registo' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await goToScreen(page, 'Contas');

  const santander = page.locator('.account-card').filter({ hasText: 'Santander' });
  await santander.getByText('Ver movimentos da conta', { exact: true }).click();
  const payment = santander.locator('.history');
  await expect(payment.locator('strong')).toHaveText('Seguro do Carro');
  await expect(payment.getByText('Seguros', { exact: true })).toBeVisible();
  await expect(payment.getByText(/^-18,00/)).toBeVisible();
  await expect(payment).not.toContainText('Pagamento / compra');
  await payment.screenshot({ path: info.outputPath('pagamento-parcial.png') });

  const activoBank = page.locator('.account-card').filter({ hasText: 'ActivoBank A' });
  await activoBank.getByText('Ver movimentos da conta', { exact: true }).click();
  const purchase = activoBank.locator('.history');
  await expect(purchase.locator('strong')).toHaveText('Mercearia');
  await expect(purchase.getByText('Comida', { exact: true })).toBeVisible();
  await expect(purchase.getByText('Refeições/Supermercado', { exact: true })).toBeVisible();
});
