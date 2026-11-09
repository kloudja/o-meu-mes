import { goToScreen } from './navigation';
import { expect, test, type Page } from '@playwright/test';

const d = (p: Page) => p.getByRole('dialog');
const noOverflow = async (p: Page) => expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('a compra noutra conta atualiza o painel e a sugestão de transferência',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/demo');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page,'Definições');
  const bank=page.locator('.catalog-row').filter({hasText:'BankInter A'});
  await bank.getByRole('button',{name:'Desativar',exact:true}).click();
  await goToScreen(page,'Mês');
  const accounts=page.getByRole('region',{name:'Saldos atuais e previstos'});
  await expect(accounts).not.toContainText('BankInter A');
  await goToScreen(page,'Plano e movimentos');
  await page.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();
  await d(page).getByLabel('Montante (€)',{exact:true}).fill('30');
  const source=d(page).getByRole('combobox',{name:'Origem do dinheiro'});
  await source.fill('sant');
  await expect(d(page).getByRole('option',{name:'Santander',exact:true})).toBeVisible();
  await page.screenshot({path:'docs/capturas/fase-6/seletor-conta-390.png'});
  await source.press('ArrowDown');
  await source.press('Enter');
  await expect(source).toHaveValue('Santander');
  await d(page).getByRole('button',{name:'Confirmar registo'}).click();
  await goToScreen(page,'Mês');
  const santander=accounts.locator('.account-mini').filter({hasText:'Santander'});
  await expect(santander).toContainText('70,00');
  await expect(santander).toContainText('-80,00');
  await expect(page.locator('.funds-alert')).toContainText('80,00');
  await goToScreen(page,'Contas');
  await page.getByRole('button',{name:'Quanto transferir para cada conta'}).click();
  await expect(d(page).getByTestId('route-act-r-san')).toContainText('80,00');
  await noOverflow(page);
});

for (const width of [1366, 360, 390]) {
  test(`percursos prioritários e teclado — ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 });
    await page.goto('/demo');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
    await noOverflow(page);
    await page.screenshot({ path: `docs/capturas/fase-6/mes-${width}.png` });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar para o conteúdo' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await goToScreen(page,'Plano e movimentos');
    if (width < 700) {
      for (const name of ['Pagar', 'Detalhe de Habitação']) {
        expect((await page.getByTestId('line-rent').getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.getByTestId('line-rent').getByRole('button', { name: 'Pagar', exact: true }).click();
    await page.getByRole('button', { name: 'Detalhe de Habitação', exact: true }).click();
    await page.keyboard.press('Shift+Tab');
    await expect(d(page).getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(d(page).getByRole('button', { name: 'Fechar diálogo', exact: true })).toBeFocused();
    await noOverflow(page);
    await expect(d(page)).toContainText('Sem referência');
    await expect(d(page).locator('.detail-values>div').filter({ hasText: /^Realizado/ })).toContainText('85,00');
    await d(page).getByRole('button', { name: 'Anular', exact: true }).click();
    await expect(d(page)).toContainText('Anulado');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Detalhe de Habitação', exact: true })).toBeFocused();

    await page.getByRole('button', { name: 'Detalhe de Serviços Essenciais', exact: true }).click();
    await d(page).getByRole('button', { name: 'Parcial ou diferente' }).click();
    await d(page).getByLabel('Montante (€)', { exact: true }).fill('40');
    await d(page).getByRole('button', { name: 'Confirmar registo' }).click();
    await expect(page.getByTestId('line-services')).toContainText('60,00');
    await goToScreen(page,'Mês');
    await page.getByRole('button', { name: 'Guardar plano inicial', exact: true }).click();
    await goToScreen(page,'Plano e movimentos');
    await page.getByRole('button', { name: 'Detalhe de Serviços Essenciais', exact: true }).click();
    await d(page).getByRole('button', { name: 'Editar plano atual' }).click();
    await d(page).getByLabel('Plano atual (€) · opcional').fill('120');
    await d(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
    await page.getByRole('button', { name: 'Detalhe de Serviços Essenciais', exact: true }).click();
    await expect(d(page).locator('.detail-values>div').filter({ hasText: /^Plano inicial/ })).toContainText('100,00');
    await expect(d(page).locator('.detail-values>div').filter({ hasText: 'Plano atual' }).first()).toContainText('120,00');
    await page.keyboard.press('Escape');

    for (const [mode, amount] of [['purchase', '40'], ['total', '60']]) {
      await page.getByTestId('line-food').getByRole('button', { name: 'Registar', exact: true }).click();
      await d(page).getByLabel('Tipo de registo').selectOption(mode);
      await d(page).getByLabel(mode === 'total' ? 'Total gasto até à data (€)' : 'Montante (€)', { exact: true }).fill(amount);
      await d(page).getByRole('button', { name: 'Confirmar registo' }).click();
    }
    await page.getByRole('button', { name: 'Detalhe de Comida', exact: true }).click();
    await expect(d(page).locator('.detail-values>div').filter({ hasText: /^Realizado/ })).toContainText('60,00');
    await expect(d(page).locator('.history')).toContainText('20,00');
    await noOverflow(page);
    await page.screenshot({ path: `docs/capturas/fase-6/compras-${width}.png` });
    await page.keyboard.press('Escape');

    await goToScreen(page, 'Poupanças');
    const reserve = page.locator('.account-card').filter({ has: page.getByRole('heading', { name: 'Fundo Emergência', exact: true }) });
    await expect(reserve.locator('.balance-value')).toContainText('300,00');
    await goToScreen(page, 'Plano e movimentos');
    await page.getByTestId('line-health').getByRole('button', { name: 'Pagar', exact: true }).click();
    await goToScreen(page, 'Poupanças');
    await expect(reserve.locator('.balance-value')).toContainText('260,00');
    await goToScreen(page, 'Contas');
    const principal = page.locator('.account-card').filter({ has: page.getByText('Moey! A', { exact: true }) });
    await expect(principal.locator('.balance-value')).toContainText('1.000,00');
    const launch = page.getByRole('button', { name: 'Quanto transferir para cada conta', exact: true });
    await launch.click();
    await expect(d(page)).toContainText('BankInter A · Por apurar. Saldo inicial por indicar.');
    await expect(d(page).getByTestId('route-act-r-san')).toContainText('50,00');
    await page.screenshot({ path: `docs/capturas/fase-6/transferencias-${width}.png` });
    await d(page).getByTestId('route-act-r-san').getByRole('button', { name: 'Preparar esta transferência' }).click();
    await expect(d(page).getByLabel('Destino', { exact: true })).toHaveValue('Santander');
    await d(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(launch).toBeFocused();
    const santander = page.locator('.account-card').filter({ has: page.getByText('Santander', { exact: true }) });
    await expect(santander.locator('.balance-value')).toContainText('100,00');

    await page.getByRole('button', { name: 'Novo mês', exact: true }).click();
    await d(page).getByLabel('Mês', { exact: true }).fill('2026-12');
    await d(page).getByRole('button', { name: 'Abrir mês' }).click();
    await goToScreen(page, 'Plano e movimentos');
    await expect(page.getByTestId('line-services')).toContainText('100,00');
    await page.getByRole('tab', { name: 'Poupanças' }).click();
    await page.getByTestId('line-save-em').getByRole('button', { name: 'Poupar', exact: true }).click();
    await expect(d(page)).toContainText('Se esta reserva começou vazia, indique 0,00 €');
    await expect(d(page).getByLabel('Saldo inicial — Moey! A (€)', { exact: true })).toBeVisible();
    await page.screenshot({ path: `docs/capturas/fase-6/saldos-em-falta-${width}.png` });
    await page.keyboard.press('Escape');
    await goToScreen(page, 'Pagamentos recorrentes');
    await page.getByTestId('occ-google').getByRole('button', { name: 'Adicionar ao plano' }).click();
    await expect(page.getByTestId('occ-google')).toContainText('Adicionado ao plano');
    await noOverflow(page);
    await page.screenshot({ path: `docs/capturas/fase-6/lembrete-${width}.png` });
  });
}

