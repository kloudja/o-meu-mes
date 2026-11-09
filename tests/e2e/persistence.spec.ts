import { goToScreen } from './navigation';
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import type { Action } from '../../src/domain/engine';
test.skip(process.env.OMEUMES_E2E_ISOLATED!=='1','Executar com node scripts/test-browser.mjs; nunca usar uma base local.');
const d=(p:Page)=>p.getByRole('dialog');
let period:string;
let reserve:string;
let reserveName:string;
const pageErrors=new WeakMap<Page,string[]>();
test.afterEach(async({page})=>{expect(pageErrors.get(page)??[]).toEqual([]);});
async function send(api:APIRequestContext,action:Action,p?:string){const r=await api.get('/api/state');const c=await r.json();const result=await api.post('/api/state',{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL!},data:{period:p??c.state.selected,revision:c.revision,requestId:crypto.randomUUID(),action}});expect(result.ok(),await result.text()).toBe(true);return (await result.json()).state;}
test.beforeEach(async({request,page},info)=>{
  const errors:string[]=[];pageErrors.set(page,errors);page.on('pageerror',e=>errors.push(e.message));
  const index=info.line*10+(info.title.endsWith('390')?1:0);reserveName=`Reserva fictícia ${index}`;period=`${2100+index}-11`;reserve=`reserve-${index}`;
  await send(request,{type:'reserve',reserve:{id:reserve,name:reserveName,accountId:'moey-r'}});
  await send(request,{type:'month',period});
  const common={kind:'expense' as const,accountId:'act-r',categoryId:'cat-servicos'};
  for(const line of [{...common,id:'services',name:'Serviço fictício',plan:10000},{...common,id:'food',name:'Comida fictícia',plan:20000,variable:true},{...common,id:'income',name:'Recebimento fictício',kind:'income' as const,plan:120000},{...common,id:'saving',name:'Reforço fictício',kind:'saving' as const,plan:10000,accountId:'moey-r',reserveId:reserve},{...common,id:'health',name:'Despesa da reserva',plan:4000,accountId:'moey-r',reserveId:reserve}])await send(request,{type:'line',line},period);
  await send(request,{type:'initial',source:'a:act-r',amount:100000},period);await send(request,{type:'initial',source:'a:act-s',amount:25000},period);
  // Select the created period explicitly after opening; selection is local to this tab.
  await page.goto('/');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');await page.getByLabel('Mês selecionado').selectOption(period);
  await goToScreen(page,'Plano e movimentos');await expect(page.getByTestId('line-services')).toBeVisible();await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false');
});
async function buy(p:Page,n:string){await p.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await d(p).getByLabel('Montante (€)',{exact:true}).fill(n);await d(p).getByRole('button',{name:'Confirmar registo'}).click();await expect(d(p)).toHaveCount(0);}

test('pagamento, parcial, conclusão inferior/superior, recebimento, anulação e recarga',async({page})=>{
  expect(await page.getByText('Repor exemplos',{exact:true}).count()).toBe(0);
  await page.getByTestId('line-services').getByRole('button',{name:'Detalhe de Serviço fictício'}).click();await d(page).getByRole('button',{name:'Parcial ou diferente'}).click();await d(page).getByLabel('Montante (€)',{exact:true}).fill('40');await d(page).getByRole('button',{name:'Confirmar registo'}).dblclick();await expect(page.getByTestId('line-services')).toContainText('60,00');
  await page.reload();await goToScreen(page,'Plano e movimentos');await expect(page.getByTestId('line-services')).toContainText('Parcial');
  await page.getByTestId('line-services').getByRole('button',{name:'Detalhe de Serviço fictício'}).click();await d(page).getByRole('button',{name:'Parcial ou diferente'}).click();await d(page).getByLabel('Montante (€)',{exact:true}).fill('30');await d(page).getByLabel('Concluir por este valor, mesmo que diferente do previsto').check();await d(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(page.getByTestId('line-services')).toContainText('Concluída');
  await page.getByRole('tab',{name:'Recebimentos extra'}).click();await page.getByTestId('line-income').getByRole('button',{name:'Receber',exact:true}).dblclick();await expect(page.getByTestId('line-income')).toContainText('Concluído');
  await goToScreen(page, 'Contas');const account=page.locator('.account-card').filter({has:page.getByText('ActivoBank A',{exact:true})});await expect(account.locator('.balance-value')).toContainText('2.130,00');await account.getByText('Ver movimentos da conta').click();await account.getByRole('button',{name:'Anular',exact:true}).last().click();await expect(account.locator('.balance-value')).toContainText('930,00');
  await goToScreen(page, 'Plano e movimentos');await page.getByRole('tab',{name:'Despesas'}).click();await page.getByTestId('line-services').getByRole('button',{name:'Detalhe de Serviço fictício'}).click();await d(page).getByRole('button',{name:'Anular',exact:true}).last().click();await expect(d(page).getByText('Concluída',{exact:true})).toHaveCount(0);await d(page).getByRole('button',{name:'Parcial ou diferente'}).click();await d(page).getByLabel('Montante (€)',{exact:true}).fill('70');await d(page).getByLabel('Concluir por este valor, mesmo que diferente do previsto').check();await d(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(page.getByTestId('line-services')).toContainText('110,00');await expect(page.getByTestId('line-services')).toContainText('Concluída');
});

for(const width of [1366,390])test(`reforço com iniciais, compra por reserva, snapshot e novo mês isolado — ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:768});await page.getByRole('tab',{name:'Poupanças'}).click();await page.getByTestId('line-saving').getByRole('button',{name:'Poupar',exact:true}).click();
  await d(page).getByLabel('Saldo inicial — Moey! A (€)',{exact:true}).fill('1000');await d(page).getByLabel(/Saldo inicial — Poupança · Reserva fictícia/).fill('0');await page.screenshot({path:`docs/capturas/fase-3/iniciais-${width}.png`});
  await d(page).getByRole('button',{name:'Confirmar saldos e registo'}).click();await expect(d(page)).toHaveCount(0);await page.getByRole('tab',{name:'Despesas'}).click();await page.getByTestId('line-health').getByRole('button',{name:'Pagar',exact:true}).click();await expect(page.getByTestId('line-health')).toContainText('Concluída');
  await goToScreen(page,'Mês');await page.getByRole('button',{name:'Guardar plano inicial',exact:true}).click();await expect(page.getByText(/Plano inicial guardado ·/)).toBeVisible();await page.screenshot({path:`docs/capturas/fase-3/sucesso-${width}.png`,fullPage:true});
  await page.reload();await goToScreen(page, 'Contas');await expect(page.locator('.account-card').filter({has:page.getByText('Moey! A',{exact:true})}).locator('.balance-value')).toContainText('900,00');
  await goToScreen(page, 'Poupanças');const reserveCard=page.locator('.account-card').filter({has:page.getByRole('heading',{name:reserveName})});await expect(reserveCard.locator('.balance-value')).toContainText('60,00');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Novo mês',exact:true}).click();await d(page).getByLabel('Mês',{exact:true}).fill(`${period.slice(0,4)}-12`);await d(page).getByRole('button',{name:'Abrir mês'}).click();await goToScreen(page, 'Plano e movimentos');await expect(page.getByText('Ainda sem movimentos',{exact:true})).toBeVisible();await goToScreen(page, 'Contas');await expect(page.locator('.account-card').first().locator('.balance-value')).toContainText('Por indicar');
});

test('compras, total, detalhe incluído e dependência persistem sem duplicar',async({page})=>{
  await buy(page,'40');await page.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await d(page).getByLabel('Tipo de registo').selectOption('total');await d(page).getByLabel('Total gasto até à data (€)').fill('60');await d(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(d(page)).toHaveCount(0);
  await page.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await d(page).getByLabel('Tipo de registo').selectOption('detail');await d(page).getByLabel('Ajuste que já inclui esta compra').selectOption({index:1});await d(page).getByLabel('Montante (€)',{exact:true}).fill('10');await d(page).getByLabel('Nome da compra (opcional)').fill('Compra fictícia incluída');await d(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(d(page)).toHaveCount(0);await buy(page,'10');
  await page.reload();await goToScreen(page,'Plano e movimentos');await expect(page.getByTestId('line-food')).toContainText('70,00');await page.getByTestId('line-food').getByRole('button',{name:'Detalhe de Comida fictícia'}).click();const adjustment=d(page).locator('.history>div').filter({hasText:'Ajuste conciliado do total acumulado'});await adjustment.getByRole('button',{name:'Anular',exact:true}).click();await expect(d(page).getByRole('alert')).toContainText('dependentes');await expect(d(page).getByRole('alert')).toBeInViewport();
});

test('conferência e transferência atualizam saldos confirmados',async({page})=>{
  await buy(page,'40');await goToScreen(page, 'Contas');const account=page.locator('.account-card').filter({has:page.getByText('ActivoBank A',{exact:true})});await account.getByRole('button',{name:'Atualizar montante'}).click();await d(page).getByLabel('Saldo observado no banco (€)').fill('955');await d(page).getByLabel('Motivo da diferença').fill('Conferência fictícia');await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(account.locator('.balance-value')).toContainText('955,00');
  await page.getByRole('button',{name:'Transferir entre contas'}).click();await d(page).getByLabel('Montante (€)',{exact:true}).fill('50');await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(account.locator('.balance-value')).toContainText('905,00');await page.reload();await goToScreen(page, 'Contas');await expect(account.locator('.balance-value')).toContainText('905,00');
});

for(const width of [1366,390])test(`falha antes do commit mantém campos e permite repetir com segurança — ${width}`,async({page,request})=>{
  await page.setViewportSize({width,height:width===390?844:768});let fail=true;
  await page.route('**/api/state',async route=>{if(route.request().method()==='POST'&&fail){fail=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'STORAGE',message:'Gravação de teste recusada. Repita a confirmação.'})});}else await route.continue();});
  await page.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await d(page).getByLabel('Montante (€)',{exact:true}).fill('40');await d(page).getByLabel('Nome da compra (opcional)').fill('Tentativa fictícia');await d(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(d(page).getByRole('alert')).toContainText('recusada');await expect(d(page).getByLabel('Montante (€)',{exact:true})).toHaveValue('40');await page.screenshot({path:`docs/capturas/fase-3/falha-${width}.png`});
  const before=await (await request.get('/api/state?period='+period)).json();expect(before.state.months[period].events).toHaveLength(0);
  await d(page).getByRole('button',{name:'Repetir confirmação'}).click();await expect(d(page)).toHaveCount(0);await expect(page.getByTestId('line-food')).toContainText('40,00');const after=await (await request.get('/api/state?period='+period)).json();expect(after.state.months[period].events).toHaveLength(1);
});

test('commit com resposta perdida, recarga e repetição preservam identidade e não pagam novamente',async({page,request})=>{
  let lose=true;await page.route('**/api/state',async route=>{if(route.request().method()==='POST'&&lose){lose=false;const confirmed=await route.fetch();expect(confirmed.ok()).toBe(true);await route.abort('failed');}else await route.continue();});
  await page.getByTestId('line-services').getByRole('button',{name:'Pagar',exact:true}).click();await expect(page.getByRole('button',{name:'Repetir confirmação'}).first()).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Repetir confirmação'})).toBeVisible();const recovered=await page.context().newPage();await page.close();await recovered.goto('/');await expect(recovered.getByRole('button',{name:'Repetir confirmação'})).toBeVisible();await recovered.getByRole('button',{name:'Repetir confirmação'}).click();await expect(recovered.getByRole('button',{name:'Repetir confirmação'})).toHaveCount(0);await recovered.close();
  const s=await (await request.get('/api/state?period='+period)).json();expect(s.state.months[period].events).toHaveLength(1);expect(s.state.months[period].events[0].amount).toBe(10000);
});

test('dois separadores não sobrepõem edição confirmada e conflito conserva campos',async({page,context,request})=>{
  const other=await context.newPage();await other.goto('/');await expect(other.locator('.app-shell')).toHaveAttribute('data-ready','true');await other.getByLabel('Mês selecionado').selectOption(period);await goToScreen(other,'Plano e movimentos');
  await page.getByTestId('line-services').getByRole('button',{name:'Detalhe de Serviço fictício'}).click();await d(page).getByRole('button',{name:'Editar plano atual'}).click();await d(page).getByLabel('Plano atual (€) · opcional').fill('120');
  await other.getByTestId('line-services').getByRole('button',{name:'Pagar',exact:true}).click();await expect(other.getByTestId('line-services')).toContainText('Concluída');
  await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();
  await expect(d(page).getByRole('alert')).toContainText('Os dados mudaram');
  await expect(d(page).getByLabel('Plano atual (€) · opcional')).toHaveValue('120');
  await expect(d(page).getByRole('button',{name:'Confirmar',exact:true})).toBeDisabled();
  await d(page).getByRole('button',{name:'Recarregar para voltar a editar'}).click();
  await expect(d(page)).toHaveCount(0);const s=await (await request.get('/api/state?period='+period)).json();expect(s.state.months[period].events).toHaveLength(1);expect(s.state.months[period].lines.find((l:{id:string})=>l.id==='services').plan).toBe(10000);await other.close();
});

test('carregamento inicial explícito em desktop e móvel',async({page})=>{
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:width===390?844:768});let release!:()=>void;const gate=new Promise<void>(r=>release=r);await page.route('**/api/state',async route=>{await gate;await route.continue();});await page.goto('/');await expect(page.getByRole('status')).toContainText('A abrir os dados locais');await page.screenshot({path:`docs/capturas/fase-3/carregamento-${width}.png`});release();await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');await page.unroute('**/api/state');
  }
});

test('catálogo, reserva, Modelo Base e definições recorrentes são gravados pela interface',async({page,request})=>{
  await goToScreen(page, 'Poupanças');await page.getByRole('button',{name:'Criar poupança',exact:true}).click();await d(page).getByLabel('Nome da poupança').fill('Finalidade de teste escolhida');await d(page).getByLabel('Banco onde está a poupança',{exact:true}).fill('Moey! B');await d(page).getByRole('option',{name:'Moey! B',exact:true}).click();await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d(page)).toContainText('Quanto quer poupar este mês?');await d(page).getByRole('button',{name:'Cancelar'}).click();await expect(page.getByRole('heading',{name:'Finalidade de teste escolhida'})).toBeVisible();
  await goToScreen(page, 'Modelo Base');await page.getByRole('button',{name:'Adicionar ao modelo'}).click();await d(page).getByLabel('Nome',{exact:true}).fill('Plano de teste escolhido');await d(page).getByLabel('Montante habitual (€) · opcional').fill('');await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d(page)).toHaveCount(0);
  await goToScreen(page, 'Pagamentos recorrentes');await page.getByRole('button',{name:'Novo recorrente'}).click();await d(page).getByLabel('Nome',{exact:true}).fill('Lembrete de teste escolhido');await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d(page)).toHaveCount(0);
  await goToScreen(page, 'Definições');await page.locator('.catalog-row').filter({hasText:'BankInter A'}).getByRole('button',{name:'Editar',exact:true}).click();await d(page).getByLabel('Nome',{exact:true}).fill('BankInter revisto no teste');await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d(page)).toHaveCount(0);await page.reload();await goToScreen(page, 'Definições');await expect(page.getByText('BankInter revisto no teste',{exact:true})).toBeVisible();
  const s=await (await request.get('/api/state?period='+period)).json();expect(s.state.base.find((l:{name:string})=>l.name==='Plano de teste escolhido').plan).toBeNull();expect(s.state.recurring.find((r:{name:string})=>r.name==='Lembrete de teste escolhido').amount).toBeNull();expect(s.state.months[period].events).toHaveLength(0);
  const demo=await page.context().newPage();await demo.goto('/demo');await expect(demo.locator('.app-shell')).toHaveAttribute('data-ready','true');await goToScreen(demo,'Plano e movimentos');await demo.getByTestId('line-rent').getByRole('button',{name:'Pagar',exact:true}).click();await demo.getByRole('button',{name:/Repor exemplos/}).click();await d(demo).getByRole('button',{name:'Repor exemplos',exact:true}).click();await demo.reload();expect(await (await request.get('/api/state?period='+period)).json()).toEqual(s);await demo.close();
});

test('armazenamento do pedido recusado no navegador não envia pagamento nem bloqueia nova tentativa',async({page,request})=>{
  await page.evaluate(()=>{const original=Storage.prototype.setItem;let deny=true;Storage.prototype.setItem=function(k,v){if(k.startsWith('omeumes.pending.v1:')&&deny){deny=false;throw new DOMException('Injected quota','QuotaExceededError');}return original.call(this,k,v);};});
  await page.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await d(page).getByLabel('Montante (€)',{exact:true}).fill('40');await d(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(d(page).getByRole('alert')).toContainText('Nenhum pedido foi enviado');expect((await (await request.get('/api/state?period='+period)).json()).state.months[period].events).toHaveLength(0);await expect(d(page).getByLabel('Montante (€)',{exact:true})).toHaveValue('40');await d(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(d(page)).toHaveCount(0);expect((await (await request.get('/api/state?period='+period)).json()).state.months[period].events).toHaveLength(1);
});

test('quanto transferir usa saldos locais e atualiza depois de confirmar e recarregar',async({page,request})=>{
  const seed=await (await request.get('/api/state?period='+period)).json();for(const line of seed.state.months[period].lines)if(line.plan===null)await send(request,{type:'line',line:{...line,plan:0}},period);await page.reload();await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page, 'Contas');
  const launch=page.getByRole('button',{name:'Quanto transferir para cada conta',exact:true});
  const moey=page.locator('.account-card').filter({has:page.getByText('Moey! A',{exact:true})});
  await moey.getByRole('button',{name:'Introduzir saldo inicial',exact:true}).click();
  await d(page).getByLabel('Saldo inicial deste mês (€)').fill('0');
  await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();
  await expect(d(page)).toHaveCount(0);
  await launch.click();
  await expect(d(page).getByTestId('route-act-r-moey-r')).toContainText('100,00');
  expect((await (await request.get('/api/state?period='+period)).json()).state.months[period].events).toHaveLength(0);
  await d(page).getByRole('button',{name:'Registar 1 transferência já efetuada'}).dblclick();
  await expect(d(page)).toHaveCount(0);
  await expect(moey.locator('.balance-value')).toContainText('100,00');
  await page.reload();
  await goToScreen(page, 'Contas');
  await launch.click();
  await expect(d(page).getByTestId('route-act-r-moey-r')).toHaveCount(0);
  const result=await (await request.get('/api/state?period='+period)).json();
  expect(result.state.months[period].events).toHaveLength(1);
  expect(result.state.months[period].events[0].deltas).toEqual({'a:act-r':-10000,'a:moey-r':10000});
});

test('o lembrete personalizado do mês anterior fica guardado sem criar despesas',async({page,request})=>{
  await goToScreen(page,'Pagamentos recorrentes');
  await page.getByRole('button',{name:'Novo recorrente'}).click();
  await d(page).getByLabel('Nome',{exact:true}).fill('Seguro fictício');
  await d(page).getByLabel('Data de referência').fill(`${period.slice(0,4)}-12-07`);
  await d(page).getByLabel('Periodicidade').selectOption('annual');
  await d(page).getByLabel('Lembrete no painel (opcional)').fill('Renegociar seguro auto');
  await d(page).getByLabel('Dias de antecedência').fill('30');
  await d(page).getByRole('button',{name:'Confirmar',exact:true}).click();
  await expect(d(page)).toHaveCount(0);
  await page.reload();
  const notes=page.getByRole('region',{name:'Lembretes de pagamentos'});
  await expect(notes).toContainText('Renegociar seguro auto');
  await expect(notes).toContainText('07/12/');
  const {state}=await (await request.get('/api/state?period='+period)).json();
  expect(state.recurring.find((r:{name:string})=>r.name==='Seguro fictício')).toMatchObject({reminderText:'Renegociar seguro auto',reminderDays:30});
  expect(state.months[period].events).toEqual([]);
  expect(state.months[period].lines.map((line:{name:string})=>line.name)).not.toContain('Seguro fictício');
});
