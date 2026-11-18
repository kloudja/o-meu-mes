import { expect, test } from './application';

import { goToScreen } from './navigation';

for(const width of [1366,390]){
  test(`o detalhe sobrepõe o conteúdo sem mover cartões a ${width} px`,async({page,openExamples},info)=>{
    await page.setViewportSize({width,height:844});
    await openExamples(page);
    const metrics=page.getByRole('region',{name:'Resumo mensal'});
    const geometry=()=>page.locator('.metric-slot .metric, .metric-heading, .metric-slot .metric>strong, .month-funding')
      .evaluateAll(elements=>elements.map(element=>{
        const {x,y,width,height}=element.getBoundingClientRect();
        return {x:x+scrollX,y:y+scrollY,width,height};
      }));
    const before=await geometry();
    const trigger=metrics.getByRole('button',{name:'Ver detalhe: Despesas por pagar',exact:true});
    await trigger.press('Space');
    const detail=metrics.getByRole('region',{name:'Detalhe: Despesas por pagar'});
    await expect(detail).toBeVisible();
    expect(await geometry()).toEqual(before);
    const underlying=width===390?metrics.getByRole('heading',{name:'Poupanças',exact:true}):
      page.getByRole('region',{name:'O que rever neste mês'});
    expect(await underlying.evaluate((element,panelId)=>{
      const rect=element.getBoundingClientRect(),panel=document.getElementById(panelId)!;
      const overlay=panel.getBoundingClientRect();
      const x=Math.max(rect.left,overlay.left)+4,y=Math.max(rect.top,overlay.top)+4;
      return x<rect.right&&y<rect.bottom&&panel.contains(document.elementFromPoint(x,y));
    },'metric-expenses')).toBe(true);
    await page.screenshot({path:info.outputPath(`detalhe-sobreposto-${width}.png`)});
    await page.keyboard.press('Tab');
    await expect(detail).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('heading',{name:'Mês',exact:true}).click();
    await expect(detail).toHaveCount(0);
    expect(await geometry()).toEqual(before);
  });
}

for(const width of [1366,390]){
  test(`sobras, atalhos e total do plano a ${width} px`,async({page,openExamples},info)=>{
    await page.setViewportSize({width,height:width===390?844:900});
    await openExamples(page);
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

test('o mês selecionado conserva o alinhamento ao passar o rato noutra opção',async({page,openExamples},info)=>{
  await openExamples(page);
  await page.getByRole('button',{name:'Novo mês'}).click();
  await page.getByRole('button',{name:'Abrir mês'}).click();
  const select=page.getByLabel('Mês selecionado');
  await expect(select).toHaveValue('2026-12');
  await select.selectOption('2026-11');
  await expect(select).toHaveValue('2026-11');
  await select.click();
  const november=select.locator('option:checked');
  const december=select.locator('option[value="2026-12"]');
  const before=await november.boundingBox();
  await december.hover();
  expect(before?.width).toBeGreaterThan(0);
  expect(await november.boundingBox()).toEqual(before);
  await page.screenshot({path:info.outputPath('seletor-de-mes.png')});
  await page.keyboard.press('Escape');
  await expect(select).toHaveValue('2026-11');
});

test('eliminar uma conta em Contas pede confirmação e persiste após recarregar',async({page})=>{

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
