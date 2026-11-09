import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { goToScreen } from './navigation';
import type { Action } from '../../src/domain/engine';
import type { Confirmed } from '../../src/server/repository';
import type { Month } from '../../src/domain/model';

test.skip(process.env.OMEUMES_E2E_ISOLATED!=='1','Requer a base fictícia do executor Playwright.');
const dialog=(page:Page)=>page.getByRole('dialog');
const confirm=(page:Page)=>dialog(page).getByRole('button',{name:'Confirmar',exact:true});
const amount=(page:Page)=>dialog(page).getByLabel('Montante (€)',{exact:true});
const account=(page:Page,name:string)=>page.locator('.account-card').filter({has:page.getByText(name,{exact:true})});
const launch=(page:Page)=>page.getByRole('button',{name:'Quanto transferir para cada conta'});
const batch=(page:Page)=>dialog(page).getByRole('button',{name:/Registar \d+ transferências? já efetuadas?/});
const capture=(page:Page,name:string)=>page.screenshot({path:`docs/capturas/fase-6-revisao/${name}.png`});
const snapshot=async(api:APIRequestContext,period:string):Promise<Confirmed>=>(await api.get('/api/state?period='+period)).json();
const balanceOf=(month:Month,source:string)=>(month.initials[source]??0)+month.events.filter(e=>!e.voided).reduce((n,e)=>n+(e.deltas[source]??0),0);

async function post(api:APIRequestContext,period:string,revision:number,action:Action,requestId=crypto.randomUUID()){
  return api.post('/api/state',{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL!},data:{period,revision,requestId,action}});
}
async function seed(api:APIRequestContext,period:string,actions:Action[]){
  const initial=await snapshot(api,period);
  const opened=await post(api,initial.state.selected,initial.revision,{type:'month',period});
  expect(opened.ok(),await opened.text()).toBe(true);
  let current:Confirmed=await opened.json();
  // The suite shares a synthetic catalog. Clear inherited template lines in this new month.
  const inherited:Action[]=current.state.months[period].lines.map(l=>({type:'removeLine',id:l.id}));
  for(const action of [...inherited,...actions]){
    const response=await post(api,period,current.revision,action);
    expect(response.ok(),await response.text()).toBe(true);
    current=await response.json();
  }
  return current;
}
async function openPeriod(page:Page,period:string){
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await page.getByLabel('Mês selecionado').selectOption(period);
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false');
}
function expense(id:string,name:string,plan:number,accountId='act-r',extra={}):Action{
  return {type:'line',line:{id,name,plan,accountId,kind:'expense',categoryId:'cat-servicos',...extra}};
}
async function invalid(field:Locator,message:RegExp){
  await expect(field).toHaveAttribute('aria-invalid','true');
  await expect(field).toHaveAccessibleDescription(message);
  await expect(field).toBeFocused();
}

test('duas sessões recusam 50 €, reveem 35 € e repetem o pedido gravado sem duplicar',async({page,browser,request,baseURL})=>{
  const period='2080-11';
  await seed(request,period,[expense('review-san','Seguro fictício',5000,'san'),
    {type:'initial',source:'a:act-r',amount:5000},{type:'initial',source:'a:san',amount:0}]);
  await openPeriod(page,period);
  await goToScreen(page,'Contas');
  await launch(page).click();
  const route=dialog(page).getByTestId('route-act-r-san');
  await expect(route).toContainText('50,00');
  const old=await snapshot(request,period);
  let staleRead=true;
  await page.route('**/api/state*',async interceptor=>{
    const req=interceptor.request();
    if(staleRead&&req.method()==='GET')await interceptor.fulfill({json:old});
    else if(staleRead&&req.method()==='POST'){
      const response=await interceptor.fetch();
      staleRead=false;
      await interceptor.fulfill({response});
    }else await interceptor.continue();
  });
  const second=await browser.newContext({baseURL});
  try{
    const other=await second.newPage();
    await openPeriod(other,period);
    await goToScreen(other,'Contas');
    await account(other,'ActivoBank A').getByRole('button',{name:'Atualizar montante'}).click();
    await dialog(other).getByLabel('Saldo observado no banco (€)').fill('35');
    await dialog(other).getByLabel('Motivo da diferença').fill('Conferência fictícia');
    await confirm(other).click();
    await expect(dialog(other)).toHaveCount(0);
    const refusal=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/state'));
    await batch(page).click();
    expect((await refusal).status()).toBe(409);
    await expect(dialog(page).getByRole('alert')).toContainText('montantes sugeridos mudaram');
    await expect(dialog(page).getByRole('alert')).toContainText(/de 50,00.*para 35,00/);
    await expect(batch(page)).toBeDisabled();
    await expect(route).toContainText('50,00');
    const intermediate=await snapshot(request,period);
    const m=intermediate.state.months[period];
    expect(m.events.map(e=>e.deltas)).toEqual([{'a:act-r':-1500}]);
    expect(balanceOf(m,'a:act-r')).toBe(3500);
    expect(balanceOf(m,'a:san')).toBe(0);
    const forged=await post(request,period,intermediate.revision,{type:'recordSuggestedTransfers',period,date:period+'-18',routes:[{source:'a:act-r',destination:'a:san',amount:5000}]});
    expect(forged.status()).toBe(422);
    expect((await snapshot(request,period)).revision).toBe(intermediate.revision);
    await dialog(page).getByRole('button',{name:'Rever nova lista'}).click();
    await expect(route).toContainText('35,00');
    await expect(dialog(page).getByTestId('uncovered-san')).toContainText('15,00');
    const date=dialog(page).getByLabel('Data efetiva');
    await date.fill('2080-12-01');
    await batch(page).click();
    await invalid(date,/pertencer ao mês/);
    await date.fill(period+'-18');
    await capture(page,'lote-revisto');
    await page.unroute('**/api/state*');
    let loseResponse=true;
    await page.route('**/api/state',async interceptor=>{
      if(loseResponse&&interceptor.request().method()==='POST'){
        const result=await interceptor.fetch();
        expect(result.ok()).toBe(true);
        loseResponse=false;
        await interceptor.abort();
      }else await interceptor.continue();
    });
    await batch(page).dblclick();
    await dialog(page).getByRole('button',{name:'Repetir confirmação'}).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.reload();
    await page.getByLabel('Mês selecionado').selectOption(period);
    await goToScreen(page,'Contas');
    await expect(account(page,'ActivoBank A').locator('.balance-value')).toContainText('0,00');
    await expect(account(page,'Santander').locator('.balance-value')).toContainText('35,00');
    const saved=(await snapshot(request,period)).state.months[period];
    expect(saved.events.filter(e=>e.type==='transfer')).toMatchObject([{date:period+'-18',deltas:{'a:act-r':-3500,'a:san':3500}}]);
    expect([balanceOf(saved,'a:act-r'),balanceOf(saved,'a:san')]).toEqual([0,3500]);
  }finally{await second.close();}
});

test('compra vazia, prévia 40 → 60, erros no campo e recibo de pagamento',async({page,request})=>{
  const period='2081-11';
  await seed(request,period,[expense('review-food','Comida',20000,'act-r',{variable:true}),expense('review-rent','Habitação',8500),
    {type:'initial',source:'a:act-r',amount:50000}]);
  await page.setViewportSize({width:390,height:560});
  await openPeriod(page,period);
  await goToScreen(page,'Plano e movimentos');
  const food=page.getByTestId('line-review-food');
  const buy=()=>food.getByRole('button',{name:'Registar',exact:true}).click();
  const save=()=>dialog(page).getByRole('button',{name:'Confirmar registo'}).click();
  await buy();
  await expect(amount(page)).toHaveValue('');
  await save();
  await invalid(amount(page),/montante válido/);
  let m=(await snapshot(request,period)).state.months[period];
  expect(m.events).toHaveLength(0);
  expect(balanceOf(m,'a:act-r')).toBe(50000);
  await amount(page).fill('40');
  const source=dialog(page).getByRole('combobox',{name:'Origem do dinheiro'});
  await source.fill('Santander');
  await save();
  await invalid(source,/origem do dinheiro na lista/);
  await expect(amount(page)).toHaveValue('40');
  await expect(amount(page)).toHaveAttribute('aria-invalid','false');
  await source.fill('ActivoBank A');
  await source.press('ArrowDown');
  await source.press('Enter');
  await save();
  await expect(dialog(page)).toHaveCount(0);
  await buy();
  await dialog(page).getByLabel('Tipo de registo').selectOption('total');
  const total=dialog(page).getByLabel('Total gasto até à data (€)');
  await total.fill('30');
  await save();
  await invalid(total,/inferior às compras conhecidas/);
  expect((await snapshot(request,period)).state.months[period].events).toHaveLength(1);
  await total.fill('60');
  const preview=dialog(page).locator('.total-preview');
  await expect(preview).toContainText(/Gasto já registado40,00/);
  await expect(preview).toContainText(/Novo total60,00/);
  await expect(preview).toContainText('Débito adicional de 20,00');
  await preview.scrollIntoViewIfNeeded();
  await capture(page,'total-390-altura-reduzida');
  await save();
  await expect(food.locator('.realized')).toBeVisible();
  await expect(food.locator('.realized')).toContainText('60,00');
  await expect(food.locator('.payment-feedback')).toContainText(/Total gasto de 60,00.*Débito adicional de 20,00/);
  m=(await snapshot(request,period)).state.months[period];
  expect(m.events.map(e=>[e.type,e.amount,e.deltas])).toEqual([['execution',4000,{'a:act-r':-4000}],['total',2000,{'a:act-r':-2000}]]);
  expect(balanceOf(m,'a:act-r')).toBe(44000);
  const rent=page.getByTestId('line-review-rent');
  const pay=rent.getByRole('button',{name:'Pagar',exact:true});
  const detail=rent.getByRole('button',{name:'Detalhe de Habitação'});
  await pay.focus();
  await page.keyboard.press('Enter');
  await expect(detail).toBeFocused();
  await expect(page.getByRole('status').filter({hasText:'Habitação'})).toContainText(/85,00.*01\/11\/2081.*ActivoBank A/);
  await expect(rent.getByRole('button',{name:'Ver registo'})).toBeInViewport();
  await capture(page,'pagamento-confirmado-390');
  await detail.press('Enter');
  await expect(dialog(page)).toContainText('Registos e correções');
  await page.keyboard.press('Escape');
  await expect(detail).toBeFocused();
  await page.reload();
  await page.getByLabel('Mês selecionado').selectOption(period);
  await goToScreen(page,'Plano e movimentos');
  await expect(rent.getByRole('button',{name:'Ver registo'})).toHaveCount(0);
  await rent.getByRole('button',{name:'Detalhe de Habitação'}).click();
  await expect(dialog(page).locator('.history')).toContainText('85,00');
  expect(balanceOf((await snapshot(request,period)).state.months[period],'a:act-r')).toBe(35500);
});

test('reserva homónima selecionada no cartão mantém o ID e a falta fica visível',async({page,request})=>{
  const period='2082-11';
  await seed(request,period,[
    {type:'reserve',reserve:{id:'review-first',name:'Reserva de ensaio',accountId:'moey-r'}},
    {type:'initial',source:'r:review-first',amount:30000},
    {type:'reserve',reserve:{id:'review-second',name:'Reserva de ensaio',accountId:'moey-r'}},
    {type:'initial',source:'r:review-second',amount:10000},
    {type:'reserve',reserve:{id:'review-empty',name:'Reserva sem fundos',accountId:'moey-r'}},
    {type:'initial',source:'r:review-empty',amount:0},
    {type:'initial',source:'a:moey-r',amount:50000},
    expense('review-health','ADSE',4000,'moey-r',{reserveId:'review-empty'})
  ]);
  await openPeriod(page,period);
  const warning=page.getByRole('region',{name:'Disponibilidade nas reservas'});
  await expect(warning).toContainText('Faltam 40,00');
  await warning.getByRole('button',{name:'Ver reserva'}).click();
  await expect(page.locator('#reserve-review-empty')).toBeFocused();
  const first=page.locator('#reserve-review-first'),second=page.locator('#reserve-review-second');
  await second.getByRole('button',{name:'Poupar',exact:true}).click();
  await expect(dialog(page)).toContainText(/Reserva 2 de 2.*Moey! A/);
  const source=dialog(page).getByRole('combobox',{name:'De que banco sai o dinheiro?'});
  await amount(page).fill('10');
  await source.fill('Moey!');
  await confirm(page).click();
  await invalid(source,/origem do dinheiro na lista/);
  await expect(amount(page)).toHaveValue('10');
  await source.fill('Moey! A');
  await dialog(page).getByRole('option',{name:'Moey! A',exact:true}).click();
  await capture(page,'destino-reserva-homonima');
  await confirm(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Mês selecionado').selectOption(period);
  await goToScreen(page,'Poupanças');
  await expect(first.locator('.balance-value')).toContainText('300,00');
  await expect(second.locator('.balance-value')).toContainText('110,00');
  const month=(await snapshot(request,period)).state.months[period];
  expect(month.events.map(e=>e.deltas)).toEqual([{'a:moey-r':-1000,'r:review-second':1000}]);
  expect(['r:review-first','r:review-second','a:moey-r'].map(id=>balanceOf(month,id))).toEqual([30000,11000,49000]);
});

test('Seguro do Carro requer associação explícita e a pesquisa reage ao renomear',async({page})=>{
  await page.goto('/demo');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page,'Pagamentos recorrentes');
  const car=page.getByTestId('occ-car-annual');
  await expect(car).toContainText(/Possível correspondência.*Santander.*150,00.*0,00/);
  await expect(car.getByRole('button').first()).toHaveText('Associar a movimento existente');
  await expect(car.getByRole('button',{name:'Criar despesa separada'})).toBeVisible();
  await car.getByRole('button',{name:'Associar a movimento existente'}).click();
  await expect(confirm(page)).toBeDisabled();
  await dialog(page).getByLabel('Movimento existente').selectOption('insurance');
  await confirm(page).click();
  await expect(car).toContainText('Associado a Seguro do Carro');
  await goToScreen(page,'Mês');
  await expect(page.locator('.account-mini').filter({hasText:'Santander'})).toContainText('100,00');
  await goToScreen(page,'Plano e movimentos');
  await expect(page.locator('.plan-total')).toContainText('705,00');
  await expect(page.getByTestId('line-insurance').locator('.realized')).toContainText('0,00');
  await page.getByRole('textbox',{name:'Pesquisar movimentos'}).fill('sem coincidência');
  await expect(page.getByText('Sem resultados para esta pesquisa')).toBeVisible();
  await page.getByRole('button',{name:'Limpar pesquisa'}).click();
  await expect(page.getByTestId('line-insurance')).toBeVisible();
  await goToScreen(page,'Definições');
  await page.getByRole('textbox',{name:'Pesquisar contas'}).fill('Santander');
  await page.locator('.catalog-row').filter({hasText:'Santander'}).getByRole('button',{name:'Editar'}).click();
  await dialog(page).getByRole('textbox',{name:'Nome',exact:true}).fill('Conta renomeada');
  await confirm(page).click();
  await expect(page.getByText('Sem resultados para esta pesquisa')).toBeVisible();
  await page.getByRole('button',{name:'Limpar pesquisa'}).click();
  await expect(page.locator('.catalog-row').getByText('Conta renomeada')).toBeVisible();
});

test('resumo com números extensos, reflow, contraste, toque e ajuda por teclado',async({browser,baseURL,request})=>{
  const period='2083-11';
  await seed(request,period,[expense('review-large','Compromisso fictício',234567890123456),
    {type:'initial',source:'a:act-r',amount:123456789012345}]);
  const context=await browser.newContext({baseURL,hasTouch:true,locale:'pt-PT'});
  try{
    const page=await context.newPage();
    await openPeriod(page,period);
    const metrics=page.getByRole('region',{name:'Resumo mensal'});
    await expect(metrics).toContainText('1.234.567.890.123,45');
    await expect(metrics).toContainText('-1.111.111.011.111,11');
    await expect(metrics).toContainText('0,00');
    await expect(metrics).toContainText('Subtotal · 1 de 6 contas');
    for(const width of [320,360,390,701,768,820,1024,1366,683,341]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>window.scrollTo(0,0));
      const measured=await metrics.evaluate(section=>{
        const luminance=(rgb:string)=>{
          const [r,g,b]=rgb.match(/[\d.]+/g)!.slice(0,3).map(v=>{
            const channel=Number(v)/255;
            return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;
          });
          return .2126*r+.7152*g+.0722*b;
        };
        const cards=[...section.querySelectorAll<HTMLElement>('.metric')];
        return {
          overflow:document.documentElement.scrollWidth>innerWidth,
          headerFits:[...document.querySelectorAll('.month-controls > *')].filter(el=>el.getClientRects().length).every(el=>{
            const header=document.querySelector('.topbar')!.getBoundingClientRect(),rect=el.getBoundingClientRect();
            return rect.top>=header.top&&rect.bottom<=header.bottom&&rect.right<=header.right;
          }),
          columns:cards.filter(card=>card.offsetTop===cards[0].offsetTop).length,
          amounts:cards.map(card=>{
            const value=card.querySelector('strong')!,range=document.createRange();
            range.selectNodeContents(value);
            return {lines:range.getClientRects().length,fits:range.getBoundingClientRect().right<=card.getBoundingClientRect().right-7};
          }),
          contrasts:cards.flatMap(card=>[...card.querySelectorAll('h2,strong,small,summary')].map(el=>{
            const fg=luminance(getComputedStyle(el).color),bg=luminance(getComputedStyle(card).backgroundColor);
            return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
          }))
        };
      });
      expect(measured.overflow,`${width} px`).toBe(false);
      expect(measured.headerFits,`${width} px`).toBe(true);
      expect(measured.columns,`${width} px`).toBe(width===1366?4:width>=683?2:1);
      expect(measured.amounts,`${width} px`).toEqual(Array(4).fill({lines:1,fits:true}));
      expect(Math.min(...measured.contrasts),`${width} px`).toBeGreaterThanOrEqual(4.5);
      if([320,390,701,768,1366].includes(width))await capture(page,`resumo-${width}`);
    }
    const help=metrics.getByRole('button',{name:/detalhe: Saldo atual das contas/});
    const explanation=metrics.getByText('1 de 6 contas com saldo conhecido');
    expect((await help.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await help.tap();
    await expect(explanation).toBeVisible();
    await help.press('Enter');
    await expect(explanation).toBeHidden();
    await help.press('Space');
    await expect(explanation).toBeVisible();
  }finally{await context.close();}
});

test('atualização em diálogo invalida a revisão e o percurso individual grava só uma rota',async({page,request})=>{
  const period='2084-11';
  await seed(request,period,[expense('review-partial','Despesa fictícia',10000,'san'),
    {type:'initial',source:'a:act-r',amount:5000},{type:'initial',source:'a:moey-r',amount:3500},{type:'initial',source:'a:san',amount:0}]);
  await openPeriod(page,period);
  await goToScreen(page,'Contas');
  await launch(page).click();
  await expect(dialog(page).getByTestId('route-act-r-san')).toContainText('50,00');
  const reviewed=await snapshot(request,period);
  const update=await post(request,period,reviewed.revision,{type:'reconcile',source:'a:act-r',amount:4000,date:period+'-12',note:'Conferência fictícia'});
  expect(update.ok(),await update.text()).toBe(true);
  await expect(batch(page)).toBeDisabled({timeout:10000});
  await expect(dialog(page).getByRole('alert')).toContainText('montantes sugeridos mudaram');
  await dialog(page).getByRole('button',{name:'Rever nova lista'}).click();
  await expect(dialog(page).getByTestId('route-act-r-san')).toContainText('40,00');
  await page.keyboard.press('Escape');
  await expect(launch(page)).toBeFocused();
  expect((await snapshot(request,period)).state.months[period].events).toHaveLength(1);
  await launch(page).click();
  await dialog(page).getByTestId('route-moey-r-san').getByRole('button',{name:'Preparar esta transferência'}).click();
  await expect(amount(page)).toHaveValue('35,00');
  await dialog(page).getByLabel('Data',{exact:true}).fill(period+'-13');
  await confirm(page).click();
  await expect(dialog(page)).toHaveCount(0);
  const saved=(await snapshot(request,period)).state.months[period];
  expect(saved.events.filter(e=>e.type==='transfer')).toMatchObject([{date:period+'-13',deltas:{'a:moey-r':-3500,'a:san':3500}}]);
  expect(['a:act-r','a:moey-r','a:san'].map(source=>balanceOf(saved,source))).toEqual([4000,0,3500]);
});
