import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Action } from '../../src/domain/engine';
import type { Confirmed } from '../../src/server/repository';
import { goToScreen } from './navigation';

const period='2085-11',next='2085-12';
const dialog=(page:Page)=>page.getByRole('dialog');
const confirm=(page:Page)=>dialog(page).getByRole('button',{name:'Confirmar',exact:true});
const capture=(page:Page,name:string)=>page.screenshot({path:`docs/capturas/fase-6-ajustes/${name}.png`,animations:'disabled'});
const read=async(request:APIRequestContext,month=period):Promise<Confirmed>=>(await request.get('/api/state?period='+month)).json();
async function send(request:APIRequestContext,action:Action,month=period){
  const current=await read(request,month);
  const response=await request.post('/api/state',{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL!},
    data:{period:current.state.selected,revision:current.revision,requestId:crypto.randomUUID(),action}});
  expect(response.ok(),await response.text()).toBe(true);
}
async function chooseBank(page:Page,label:string,name:string){
  await dialog(page).getByRole('combobox',{name:label,exact:true}).fill(name);
  await dialog(page).getByRole('option',{name,exact:true}).click();
}
async function openPeriod(page:Page){
  await page.goto('/');
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  await page.getByLabel('Mês selecionado').selectOption(period);
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false');
}
const saving=(page:Page)=>page.locator('#reserve-adjust-saving');
const savingAmount=(page:Page,label:string)=>saving(page).locator('dl>div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
const noOverflow=async(page:Page)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

test('objetivo, reforço extra, associação, transferência e sugestão após recarga',async({page,request})=>{
  await send(request,{type:'month',period});
  await send(request,{type:'reserve',reserve:{id:'adjust-saving',name:'Poupança fictícia',accountId:'moey-r'}});
  for(const [source,amount] of [['a:act-r',50000],['a:moey-r',20000],['r:adjust-saving',10000]] as const){
    await send(request,{type:'initial',source,amount});
  }
  await openPeriod(page);
  await goToScreen(page,'Poupanças');
  await saving(page).getByRole('button',{name:'Quanto quer poupar este mês?'}).click();
  await dialog(page).getByLabel('Quanto quer poupar este mês? (€)',{exact:true}).fill('100');
  await confirm(page).click();
  await expect(savingAmount(page,'Objetivo do mês')).toContainText('100,00');
  await saving(page).getByRole('button',{name:'Poupar',exact:true}).click();
  await expect(dialog(page).getByLabel('Tipo de reforço')).toHaveValue('goal');
  await chooseBank(page,'De que banco sai o dinheiro?','ActivoBank A');
  await expect(dialog(page)).toContainText('500,00');
  await dialog(page).getByLabel('Montante (€)',{exact:true}).fill('40');
  await expect(dialog(page).locator('.saving-preview')).toContainText('Transferência própria de ActivoBank A para Moey! A');
  await capture(page,'reforco-entre-bancos-1366');
  await page.setViewportSize({width:390,height:844});
  await dialog(page).locator('.saving-preview').scrollIntoViewIfNeeded();
  await noOverflow(page);
  await capture(page,'reforco-entre-bancos-390');
  await page.setViewportSize({width:1366,height:768});
  await confirm(page).dblclick();
  await expect(savingAmount(page,'Já poupado para o objetivo')).toContainText('40,00');
  await expect(savingAmount(page,'Falta poupar')).toContainText('60,00');
  const eventTypes=(await read(request)).state.months[period].events.map(e=>e.type);
  expect(eventTypes).toEqual(['transfer','saving']);
  await saving(page).getByRole('button',{name:'Poupar',exact:true}).click();
  await dialog(page).getByLabel('Montante (€)',{exact:true}).fill('75');
  await expect(dialog(page).locator('.saving-preview')).toContainText(/60,00.*para o objetivo/);
  await expect(dialog(page).locator('.saving-preview')).toContainText(/15,00.*reforço extra/);
  await dialog(page).getByLabel('Tipo de reforço').selectOption('extra');
  await dialog(page).getByLabel('Montante (€)',{exact:true}).fill('20');
  await confirm(page).click();
  await expect(savingAmount(page,'Falta poupar')).toContainText('60,00');
  await saving(page).getByRole('button',{name:'Associar reforço já registado'}).click();
  const reinforcement=dialog(page).getByLabel('Reforço registado');
  await expect(reinforcement).toContainText(/01\/11\/2085.*20,00.*20,00.*por associar/);
  await reinforcement.selectOption({index:1});
  await dialog(page).getByLabel('Montante a associar (€)').fill('15');
  await confirm(page).click();
  await openPeriod(page);
  await goToScreen(page,'Poupanças');
  await expect(savingAmount(page,'Já poupado para o objetivo')).toContainText('55,00');
  await expect(savingAmount(page,'Falta poupar')).toContainText('45,00');
  await expect(saving(page).locator('.balance-value')).toContainText('160,00');
  const plan=page.getByRole('heading',{name:'Reforços planeados para este mês'}).locator('../..');
  await expect(plan).toContainText(/Já poupado para o objetivo55,00/);
  await page.setViewportSize({width:390,height:844});
  await saving(page).scrollIntoViewIfNeeded();
  await noOverflow(page);
  await capture(page,'poupanca-e-objetivo-390');
  await page.setViewportSize({width:1366,height:768});
  const confirmed=(await read(request)).state.months[period];
  expect(confirmed.events.slice(-2).map(e=>[e.type,e.deltas])).toEqual([
    ['saving',{'a:moey-r':-2000,'r:adjust-saving':2000}],['savingAssociation',{}]
  ]);
  await saving(page).getByRole('button',{name:'Editar objetivo do mês'}).click();
  await expect(dialog(page).getByLabel('Quanto quer poupar este mês? (€)')).toHaveValue('100,00');
  await dialog(page).getByLabel('Quanto quer poupar este mês? (€)').fill('110');
  await confirm(page).click();
  expect((await read(request)).state.months[period].lines.filter(l=>l.reserveId==='adjust-saving')).toHaveLength(1);
  await page.getByRole('button',{name:'Novo mês'}).click();
  await dialog(page).getByLabel('Mês',{exact:true}).fill(next);
  await dialog(page).getByRole('button',{name:'Abrir mês'}).click();
  await expect(saving(page).locator('.balance-value')).toContainText('Por indicar');
  const introduce=saving(page).getByRole('button',{name:'Introduzir Total Acumulado da Poupança'});
  await introduce.click();
  const total=dialog(page).getByLabel('Total que vê hoje no banco (€)');
  await expect(total).toHaveValue('160,00');
  await expect(dialog(page)).toContainText('novembro de 2085');
  expect((await read(request,next)).state.months[next].initials['r:adjust-saving']).toBeNull();
  await dialog(page).getByRole('button',{name:'Cancelar'}).click();
  await introduce.click();
  await total.fill('155');
  await confirm(page).click();
  await saving(page).getByRole('button',{name:'Atualizar montante total poupado'}).click();
  await total.fill('158');
  await expect(dialog(page)).toContainText(/Diferença a registar: 3,00/);
  await confirm(page).click();
  await expect(saving(page).locator('.balance-value')).toContainText('158,00');
  const newMonth=(await read(request,next)).state.months[next];
  expect(newMonth.initials['r:adjust-saving']).toBe(15500);
  expect(newMonth.events.map(e=>[e.type,e.deltas])).toEqual([['adjustment',{'r:adjust-saving':300}]]);
});

test('criação e execução, filtro de poupanças e novo tipo com pagamentos em parcelas',async({page,request})=>{
  const month='2086-11';
  await send(request,{type:'month',period:month});
  await send(request,{type:'reserve',reserve:{id:'adjust-second',name:'Poupança de outro banco',accountId:'act-r'}},month);
  await send(request,{type:'initial',source:'a:act-r',amount:50000},month);
  await send(request,{type:'initial',source:'a:moey-r',amount:20000},month);
  await page.goto('/');
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  await page.getByLabel('Mês selecionado').selectOption(month);
  await goToScreen(page,'Plano e movimentos');
  await page.getByRole('button',{name:'Registar nova despesa'}).click();
  await dialog(page).getByLabel('Nome',{exact:true}).fill('Despesa fictícia dos ajustes');
  const reserve=dialog(page).getByLabel('Poupança usada para pagar (opcional)');
  await reserve.selectOption('adjust-second');
  await chooseBank(page,'Banco de onde sai o dinheiro','Moey! A');
  await expect(reserve).toHaveValue('');
  await expect(reserve.locator('option[value="adjust-second"]')).toHaveCount(0);
  await expect(reserve.locator('option[value="adjust-saving"]')).toHaveCount(1);
  await dialog(page).getByLabel('Estado do registo').selectOption('done');
  await dialog(page).getByLabel('Tipo de despesa').selectOption('true');
  await dialog(page).getByLabel('Plano atual (€) · opcional').fill('100');
  await dialog(page).getByLabel('Montante da compra (€)').fill('20');
  await dialog(page).getByLabel('Nome da compra (opcional)').fill('Compra fictícia dos ajustes');
  await dialog(page).getByLabel('Data',{exact:true}).fill(month+'-04');
  await confirm(page).dblclick();
  const expense=page.locator('.movement').filter({hasText:'Despesa fictícia dos ajustes'});
  await expect(expense.locator('.payment-feedback')).toContainText(/20,00.*Compra fictícia dos ajustes.*04\/11\/2086.*Moey! A/);
  await expense.getByRole('button',{name:'Detalhe de Despesa fictícia dos ajustes'}).click();
  await dialog(page).getByRole('button',{name:'Editar plano atual'}).click();
  await dialog(page).getByLabel('Tipo de despesa').selectOption('false');
  await expect(dialog(page).getByLabel('Poupança usada para pagar (opcional)').locator('option[value="adjust-second"]')).toHaveCount(0);
  await confirm(page).click();
  const detail=expense.getByRole('button',{name:'Detalhe de Despesa fictícia dos ajustes'});
  await detail.click();
  await expect(dialog(page)).toContainText('Compra fictícia dos ajustes');
  await dialog(page).getByRole('button',{name:'Registar pagamento por outro banco'}).click();
  await chooseBank(page,'Banco de onde saiu o dinheiro','ActivoBank A');
  await dialog(page).getByLabel('Montante (€)',{exact:true}).fill('30');
  await dialog(page).getByRole('button',{name:'Confirmar registo'}).click();
  await expect(expense).toContainText('Parcial');
  await detail.click();
  await dialog(page).getByRole('button',{name:'Parcial ou diferente'}).click();
  await dialog(page).getByLabel('Montante (€)',{exact:true}).fill('50');
  await dialog(page).getByRole('button',{name:'Confirmar registo'}).press('Enter');
  await expect(expense).toContainText('Concluída');
  await expect(expense.getByRole('button',{name:'Pagar',exact:true})).toHaveCount(0);
  await expect(detail).toBeFocused();
  await page.getByRole('tab',{name:'Recebimentos extra'}).click();
  await page.getByRole('button',{name:'Adicionar novo recebimento extra'}).click();
  await dialog(page).getByLabel('Nome',{exact:true}).fill('Recebimento fictício dos ajustes');
  await dialog(page).getByLabel('Estado do registo').selectOption('done');
  await expect(dialog(page).getByRole('combobox',{name:'Categoria'})).toHaveCount(0);
  await dialog(page).getByLabel('Montante recebido (€)').fill('35');
  await dialog(page).getByLabel('Data',{exact:true}).fill(month+'-05');
  await confirm(page).dblclick();
  await expect(page.locator('.movement').filter({hasText:'Recebimento fictício dos ajustes'})).toContainText('35,00');
  await page.reload();
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  await page.getByLabel('Mês selecionado').selectOption(month);
  await goToScreen(page,'Contas');
  const banks=page.locator('.account-card');
  await expect(banks.filter({hasText:'ActivoBank A'}).locator('.balance-value')).toContainText('505,00');
  await expect(banks.filter({hasText:'Moey! A'}).locator('.balance-value')).toContainText('130,00');
  await capture(page,'contas-1366');
  expect((await read(request,month)).state.months[month].events.map(e=>[e.amount,e.deltas])).toEqual([
    [2000,{'a:moey-r':-2000}],[3000,{'a:act-r':-3000}],[5000,{'a:moey-r':-5000}],[3500,{'a:act-r':3500}]
  ]);
});

for(const width of [360,390,1366])test(`resumo em linha, navegação e temporizador de pagamento a ${width} px`,async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,viewport:{width,height:width<700?844:768},hasTouch:width<700,
    isMobile:width<700,locale:'pt-PT',reducedMotion:width===360?'reduce':'no-preference'});
  try{
    const page=await context.newPage();
    await page.goto('/demo');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await expect(page.getByRole('heading',{name:'Mês',exact:true})).toBeVisible();
    const balance=page.getByRole('button',{name:/detalhe: Saldo atual das contas/});
    const expenses=page.getByRole('button',{name:/detalhe: Despesas por pagar/});
    if(width<700)await balance.tap();else await balance.press('Space');
    await expect(page.locator('#metric-balance')).toContainText('Saldo por indicar');
    expect(await page.locator('#metric-balance').evaluate(el=>el.previousElementSibling?.classList.contains('metric'))).toBe(true);
    await expenses.press('Enter');
    await expect(page.locator('#metric-balance')).toBeHidden();
    await expect(page.locator('#metric-expenses')).toContainText('Habitação');
    await noOverflow(page);
    if(width!==360)await capture(page,`resumo-detalhe-${width}`);
    await goToScreen(page,'Plano e movimentos',width<700);
    await expect(page.getByRole('heading',{name:'Plano e movimentos'})).toBeVisible();
    await expect(page.getByLabel('Mês selecionado')).toHaveValue('2026-11');
    if(width<700)await expect(page.locator('.mobile-screen-title')).toHaveText('Plano e movimentos');
    const incomeTab=page.getByRole('tab',{name:'Recebimentos extra'});
    if(width<700)await incomeTab.tap();else await incomeTab.click();
    await expect(page.getByRole('button',{name:'Adicionar novo recebimento extra',exact:true})).toBeInViewport();
    await noOverflow(page);
    if(width===390)await capture(page,'plano-390');
    await page.getByRole('tab',{name:'Despesas'}).click();
    await page.clock.install();
    const line=page.getByTestId('line-rent');
    await line.getByRole('button',{name:'Pagar',exact:true}).press('Enter');
    const detail=line.getByRole('button',{name:'Detalhe de Habitação'});
    await expect(detail).toBeFocused();
    await expect(page.getByRole('status').filter({hasText:'Habitação'})).toContainText('85,00');
    const receipt=line.getByRole('button',{name:'Ver registo'});
    if(width===390)await capture(page,'pagamento-confirmado-390');
    await page.clock.runFor(9500);
    await expect(receipt).toBeVisible();
    await receipt.focus();
    await page.clock.runFor(1000);
    await expect(receipt).toBeFocused();
    await expect(receipt).toBeVisible();
    await detail.focus();
    await page.clock.runFor(300);
    await expect(receipt).toBeHidden();
    await detail.press('Enter');
    await expect(dialog(page).locator('.history')).toContainText('85,00');
    await noOverflow(page);
  }finally{await context.close();}
});
