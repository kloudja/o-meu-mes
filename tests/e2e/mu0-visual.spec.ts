import { expect, test } from './application';
import { goToScreen } from './navigation';

for (const width of [1366, 390]) {
  test(`revisão das primitivas do plano a ${width}px`, async ({ page, openExamples }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await openExamples(page);
    await goToScreen(page, 'Plano e movimentos');

    const search = page.getByRole('textbox', { name: 'Pesquisar movimentos' });
    await search.fill('inexistente');
    await expect(page.getByText('Sem resultados para esta pesquisa')).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`empty-${width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'Limpar pesquisa' }).click();

    const register = page.getByTestId('line-food').getByRole('button', { name: 'Registar', exact: true });
    await register.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Montante (€)', { exact: true }).fill('12,34');
    const account = dialog.getByRole('combobox', { name: 'Origem do dinheiro' });
    await account.fill('sant');
    await expect(dialog.getByRole('option', { name: 'Santander', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`form-${width}.png`), animations: 'disabled' });
    await account.press('ArrowDown');
    await account.press('Enter');
    await expect(account).toHaveValue('Santander');
    await page.keyboard.press('Escape');
    await expect(register).toBeFocused();
  });
}
