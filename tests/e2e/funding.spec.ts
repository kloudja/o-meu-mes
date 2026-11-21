import { goToScreen } from './navigation';
import { expect, test } from './application';

for(const width of [1366,390])test(`quanto transferir por conta e preparação sem gravar — ${width}`,async({page,openExamples})=>{
  await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await openExamples(page);await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');await goToScreen(page, 'Contas');
  const launch=page.getByRole('button',{name:/^Quanto transferir para cada conta/});await launch.click();const d=page.getByRole('dialog');
  await expect(d.getByRole('button',{name:'Registar 1 transferência já efetuada'})).toBeVisible();await expect(d.getByTestId('route-act-r-san')).toContainText('ActivoBank A');await expect(d.getByTestId('route-act-r-san')).toContainText('Santander');await expect(d.getByTestId('route-act-r-san')).toContainText('50,00');await page.screenshot({path:test.info().outputPath(`contas-transferencias/resumo-${width}.png`)});
  await d.getByTestId('route-act-r-san').getByRole('button',{name:'Preparar esta transferência'}).click();
  await expect(d.getByLabel('Destino',{exact:true})).toHaveValue('Santander');await expect(d.getByLabel('Montante (€)',{exact:true})).toHaveValue('50,00');await expect(d.getByLabel('Origem',{exact:true})).toHaveValue('ActivoBank A');
  await d.getByRole('button',{name:'Cancelar',exact:true}).click();await launch.click();await expect(d.getByTestId('route-act-r-san')).toContainText('50,00');await d.getByRole('button',{name:'Fechar',exact:true}).click();await expect(launch).toBeFocused();
  await launch.click();await d.getByTestId('route-act-r-san').getByRole('button',{name:'Preparar esta transferência'}).click();await d.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d).toHaveCount(0);await launch.click();await expect(d.getByTestId('route-act-r-san')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('sugestões repartidas mostram a falta que o dinheiro disponível não cobre',async({page,openExamples})=>{
  await openExamples(page);await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page,'Plano e movimentos');await page.getByTestId('line-insurance').getByRole('button',{name:'Detalhe de Seguro do Carro'}).click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'Editar plano atual'}).click();await d.getByLabel('Valor total da despesa (€)').fill('5000');await d.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d).toHaveCount(0);
  await goToScreen(page, 'Contas');await page.getByRole('button',{name:/^Quanto transferir para cada conta/}).click();
  await expect(d.locator('.funding-route')).toHaveCount(4);await expect(d.getByTestId('route-act-r-san')).toContainText('485,00');await expect(d.getByTestId('route-moey-r-san')).toContainText('900,00');await expect(d.getByTestId('uncovered-san')).toContainText('3.115,00');
  await d.getByTestId('uncovered-san').scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('contas-transferencias/insuficiencia-origens.png')});
});

test('compra por outro banco mostra o acerto no mês até registar a transferência',async({page,openExamples})=>{
  await openExamples(page);
  await goToScreen(page,'Plano e movimentos');
  await page.getByRole('button',{name:'Adicionar despesa ao plano'}).click();
  const dialog=page.getByRole('dialog');
  const reserve=dialog.getByLabel('Poupança usada para pagar (opcional)');
  await expect(reserve).toBeDisabled();
  await expect(reserve.locator('option:checked')).toHaveText('Sem poupanças nesta conta');
  await dialog.getByRole('button',{name:'Cancelar'}).click();

  const food=page.getByTestId('line-food');
  await food.getByRole('button',{name:'Registar',exact:true}).click();
  await dialog.getByLabel('Origem do dinheiro',{exact:true}).fill('ActivoBank B');
  await dialog.getByRole('option',{name:'ActivoBank B',exact:true}).click();
  await dialog.getByLabel('Montante (€)',{exact:true}).fill('25');
  await dialog.getByRole('button',{name:'Confirmar registo'}).click();
  await expect(food.locator('.payment-feedback')).toContainText(/25,00.*ActivoBank B/);
  await goToScreen(page,'Mês');

  const alert=page.getByRole('region',{name:'Pagamentos por outra conta'});
  await expect(alert.locator('summary')).toContainText('25,00');
  await alert.locator('summary').click();
  await expect(alert.getByText('ActivoBank A → ActivoBank B')).toBeVisible();
  await expect(alert).toContainText(/Comida · Refeições\/Supermercado \(25,00/);
  await page.getByRole('button',{name:'Ver transferências sugeridas em Contas'}).click();
  const launch=page.getByRole('button',{name:/^Quanto transferir para cada conta/});
  await expect(launch).toContainText('75,00');
  await launch.click();
  await expect(dialog.getByTestId('route-act-r-act-s')).toContainText('25,00');
  await dialog.getByRole('button',{name:'Registar 2 transferências já efetuadas'}).click();
  await expect(dialog).toHaveCount(0);
  await goToScreen(page,'Mês');
  await expect(alert).toHaveCount(0);
  await expect(page.getByText('O histórico deste mês não tem pagamentos por outra conta por repor.')).toBeVisible();
});

test('o resumo distingue falta para o plano, reposição e ausência de histórico', async ({page,finance,openExamples})=>{
  await openExamples(page);
  const review=page.getByRole('region',{name:'O que rever neste mês'});
  await expect(review).toContainText('Ainda não há movimentos registados neste mês');
  await expect(review.getByText('Faltam 50,00 €',{exact:true})).toBeVisible();
  await review.getByText('1 conta por apurar',{exact:true}).click();
  await expect(review.getByText('BankInter A · Saldo inicial por indicar.')).toBeVisible();
  for(const [lineId,source,amount] of [['food','a:san',2500],['mimos','a:moey-s',1050]] as const){
    const {state,revision}=await (await finance.read()).json();
    const response=await finance.command({period:state.selected,revision,requestId:`alignment-${lineId}`,
      action:{type:'execute',lineId,source,amount,date:`${state.selected}-02`,complete:false}});
    expect(response.ok()).toBe(true);
  }
  for(const [source,amount] of [['a:act-s',4450],['r:em',0]] as const){
    const {state,revision}=await (await finance.read()).json();
    const response=await finance.command({period:state.selected,revision,requestId:`review-${source}`,
      action:{type:'reconcile',source,amount,date:`${state.selected}-03`,note:'Conferência fictícia'}});
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  const alert=page.getByRole('region',{name:'Pagamentos por outra conta'});
  await alert.locator('summary').press('Enter');
  await expect(alert).toContainText('35,50 € por repor');
  const santanderRoute=alert.locator('.month-funding-list>li').filter({hasText:'ActivoBank A → Santander'});
  await expect(santanderRoute).toContainText('25,00 € por repor');
  await expect(santanderRoute).toContainText(/02\/11\/2026.*Comida.*25,00/);
  await expect(alert.locator('.month-funding-list>li').filter({hasText:'ActivoBank B → Moey! B'}))
    .toContainText('5,00 € incluídos nas sugestões; o excedente disponível não cobre os restantes 5,50 €.');
  const santanderShortage=review.locator('.month-funding-list>li').filter({has:page.getByRole('heading',{name:'Santander',exact:true})});
  await expect(santanderShortage).toContainText('Faltam 75,00 €');
  await expect(santanderShortage).toContainText('Saldo atual: 75,00 € · Por pagar ou reforçar: 150,00 €');
  await expect(santanderShortage).toContainText('As sugestões incluem 25,00 € em reposições para esta conta.');
  await expect(review).toContainText('O valor a repor não se soma às faltas indicadas abaixo.');
  await expect(review.getByRole('region',{name:'Disponibilidade nas poupanças'})).toContainText('Faltam 40,00 €');
  await expect(review.getByText('Ainda não há movimentos registados neste mês',{exact:false})).toHaveCount(0);
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await review.screenshot({path:test.info().outputPath(`avisos-mes-${width}.png`),style:'.topbar{visibility:hidden}'});
  }
});

test('Corrigir mostra a transferência e o atalho deixa o botão de Contas à vista no telemóvel',async({page,finance,openExamples},info)=>{
  await page.setViewportSize({width:390,height:700});
  await openExamples(page);
  const correction=page.getByRole('button',{name:'Corrigir falta em Santander'});
  await correction.click();
  await expect(correction).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#funding-correction-san')).toHaveText(/Transferir 50,00\s€ de ActivoBank A para Santander/);
  const shortages=page.getByRole('region',{name:'Dinheiro em falta nas contas'});
  const name=await shortages.getByRole('heading',{name:'Santander',exact:true}).boundingBox();
  const missing=await shortages.getByText('Faltam 50,00 €',{exact:true}).boundingBox();
  expect(name?.x).toBe(missing?.x);
  await page.screenshot({path:info.outputPath('corrigir-mes.png')});
  await page.getByRole('button',{name:'Ver transferências sugeridas em Contas'}).click();
  const launch=page.getByRole('button',{name:/^Quanto transferir para cada conta/});
  await expect(launch).toBeFocused();
  await expect(launch).toBeInViewport({ratio:1});
  const header=await page.locator('.topbar').boundingBox();
  const button=await launch.boundingBox();
  expect(button!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  await page.screenshot({path:info.outputPath('atalho-contas.png')});

  const {state,revision}=await (await finance.read()).json();
  const response=await finance.command({period:state.selected,revision,requestId:'missing-account-for-correction',
    action:{type:'line',line:{id:'unassigned-expense',kind:'expense',name:'Despesa sem conta',plan:1000,accountId:'',categoryId:''}}});
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(shortages.getByText('Faltam 50,00 €',{exact:true})).toBeVisible();
  await expect(correction).toHaveCount(0);
});
