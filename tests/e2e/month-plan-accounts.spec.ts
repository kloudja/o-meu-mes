import { expect, test } from '@playwright/test';
import { goToScreen } from './navigation';

for(const width of [1366,390]){
  test(`sobras, atalhos e total do plano a ${width} px`,async({page},info)=>{
    await page.setViewportSize({width,height:width===390?844:900});
    await page.goto('/demo');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
    const budgets=page.getByRole('region',{name:'Sobras dos orçamentos'});
    const balances=page.getByRole('region',{name:'Saldos atuais e previstos'});
    const left=(await budgets.boundingBox())!,right=(await balances.boundingBox())!;
    if(width===1366){
      expect(left.x+left.width).toBeLessThan(right.x);
      expect(right.width).toBeGreaterThan(left.width);
    }else expect(left.y+left.height).toBeLessThan(right.y);
    await expect(budgets.locator('.budget-remaining')).toContainText('330,00');
    const food=budgets.locator('details').filter({hasText:'Comida'});
    await expect(food.locator('dl')).toBeHidden();
    await food.locator('summary').press('Enter');
    await expect(food.locator('dl')).toBeVisible();
    await expect(food.locator('dl')).toContainText('200,00');
    await food.locator('summary').press('Enter');
    await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
    await page.screenshot({path:info.outputPath(`mes-${width}.png`),fullPage:true});

    await page.getByRole('button',{name:'Ver detalhe: Poupanças',exact:true}).press('Space');
    await expect(page.locator('#metric-savings')).toContainText('100,00');
    await page.getByRole('button',{name:'Abrir reforços planeados em Poupanças'}).click();
    await expect(page.getByRole('heading',{name:'Reforços planeados para este mês'})).toBeFocused();

    await goToScreen(page,'Mês');
    await page.getByRole('button',{name:'Abrir despesas por pagar no plano'}).click();
    await expect(page.getByRole('tab',{name:'Despesas'})).toBeFocused();
    await expect(page.locator('.plan-total')).toContainText('705,00');
    await expect(page.getByRole('button',{name:'Ver plano inicial'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Ver todos os movimentos'})).toBeVisible();
    await page.getByRole('button',{name:'Ver todos os movimentos'}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:info.outputPath(`plano-${width}.png`)});

    for(const name of ['Abrir saldos em Contas','Abrir saldos previstos em Contas']){
      await goToScreen(page,'Mês');
      await page.getByRole('button',{name,exact:true}).click();
      await expect(page.getByRole('heading',{name:'Contas bancárias'})).toBeFocused();
    }
    const bank=page.locator('.account-card').filter({hasText:'ActivoBank A'});
    await bank.getByText('Gerir conta',{exact:true}).click();
    await expect(bank.getByRole('button',{name:'Eliminar conta'})).toBeDisabled();
    await bank.getByRole('button',{name:'Desativar',exact:true}).click();
    await expect(bank).toContainText('Desativada');
    await expect(bank.locator('.balance-value')).toContainText('950,00');
    await bank.getByRole('button',{name:'Reativar',exact:true}).click();
    await expect(bank).not.toContainText('Desativada');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:info.outputPath(`contas-${width}.png`),fullPage:true});
  });
}

test('eliminar uma conta em Contas pede confirmação e persiste após recarregar',async({page})=>{
  test.skip(process.env.OMEUMES_E2E_ISOLATED!=='1','Executar com scripts/test-browser.mjs e uma base fictícia.');
  const name='Conta fictícia para eliminar';
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page,'Contas');
  await page.getByRole('button',{name:'Adicionar conta',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Nome',{exact:true}).fill(name);
  await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();
  const card=page.locator('.account-card').filter({hasText:name});
  await card.getByText('Gerir conta',{exact:true}).click();
  const remove=card.getByRole('button',{name:'Eliminar conta'});
  await remove.click();
  await expect(dialog).toContainText(name);
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page,'Contas');
  await expect(card).toHaveCount(0);
});
