import { goToScreen } from './navigation';
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import type { Action } from '../../src/domain/engine';
import type { State } from '../../src/domain/model';

const dialog=(page:Page)=>page.getByRole('dialog');
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
const newMonth=(page:Page)=>page.getByRole('button',{name:'Novo mês',exact:true});
const confirm=(page:Page)=>dialog(page).getByRole('button',{name:'Confirmar',exact:true});
const longName='Manutenção anual e assistência técnica da habitação de exemplo';
const picture=(page:Page,name:string,width:number)=>page.screenshot({path:`docs/capturas/fase-4/${name}-${width}.png`,animations:'disabled'});
const fits=async(page:Page)=>{
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(await dialog(page).count())expect(await dialog(page).evaluate(d=>d.scrollWidth<=d.clientWidth+1)).toBe(true);
};
async function openMonth(page:Page,period:string,double=false){
  await newMonth(page).click();
  await dialog(page).getByLabel('Mês',{exact:true}).fill(period);
  const open=dialog(page).getByRole('button',{name:'Abrir mês',exact:true});
  if(double)await open.dblclick();else await open.click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByLabel('Mês selecionado')).toHaveValue(period);
}

for(const width of [1366,360,390])test.describe(`percursos renderizados a ${width} px`,()=>{
  const height=width===1366?768:width===360?800:844;
  test.use({viewport:{width,height},hasTouch:width!==1366,isMobile:width!==1366,locale:'pt-PT'});
  test('modelo, abertura, três ações, sobras e transferência',async({page})=>{
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/demo');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
    if(width!==1366)await page.getByRole('button',{name:'Menu',exact:true}).click();
    for(const label of ['Mês','Plano e movimentos','Contas','Poupanças','Pagamentos recorrentes','Modelo Base','Definições']){
      await expect(nav(page,label)).toBeInViewport();
      if(width!==1366)expect((await nav(page,label).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    if(width!==1366)await page.keyboard.press('Escape');
    if(width===390){
      await goToScreen(page,'Plano e movimentos');
      for(const [id,amount] of [['food','220'],['mimos','65']]){
        await page.getByTestId(`line-${id}`).getByRole('button',{name:'Registar',exact:true}).click();
        await dialog(page).getByLabel('Montante (€)',{exact:true}).fill(amount);
        await dialog(page).getByRole('button',{name:'Confirmar registo'}).click();
        await expect(dialog(page)).toHaveCount(0);
      }
    }
    await goToScreen(page,'Mês');
    await page.getByRole('link',{name:'Ver sobras do mês'}).click();
    const budget=page.locator('.budget-remainders');
    await expect(budget.getByRole('heading')).toBeInViewport();
    await expect(budget.locator('.budget-remaining')).toContainText(width===390?'45,00':'330,00');
    await expect(page.locator('.metric.featured')).toContainText('Subtotal · 5 de 6 contas');
    await expect(budget.locator('.budget-breakdown')).toContainText('Outras Despesas');
    await fits(page);
    if(width===390){await budget.getByRole('heading').scrollIntoViewIfNeeded();await picture(page,'sobras',width);}
    await goToScreen(page, 'Contas');
    await page.getByRole('button',{name:'Quanto transferir para cada conta'}).click();
    const route=dialog(page).getByTestId('route-act-r-san');
    await expect(route).toContainText('50,00');
    await expect(route).toContainText('ActivoBank A');
    await expect(route).toContainText('Santander');
    if(width===390)await picture(page,'transferencia-sugerida',width);
    await route.getByRole('button',{name:'Preparar esta transferência'}).click();
    await expect(dialog(page).getByLabel('Origem',{exact:true})).toHaveValue('ActivoBank A');
    await expect(dialog(page).getByLabel('Destino',{exact:true})).toHaveValue('Santander');
    await expect(dialog(page).getByLabel('Montante (€)',{exact:true})).toHaveValue('50,00');
    await fits(page);
    await dialog(page).getByRole('button',{name:'Cancelar',exact:true}).click();
    await expect(page.locator('.account-card').filter({hasText:'Santander'}).locator('.balance-value')).toContainText('100,00');

    if(width===1366)await goToScreen(page, 'Pagamentos recorrentes');else await goToScreen(page, 'Pagamentos recorrentes', true);
    await fits(page);
    await picture(page,'agenda',width);
    const car=page.getByTestId('occ-car-annual');
    const link=car.getByRole('button',{name:'Associar a movimento existente'});
    await link.click();
    const picker=dialog(page).getByLabel('Movimento existente');
    await expect(picker).toBeFocused();
    await expect(confirm(page)).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(link).toBeFocused();
    await link.click();
    await picker.selectOption('insurance');
    await expect(dialog(page).locator('.preview')).toContainText('Santander');
    if(width===360)await picture(page,'associar',width);
    await confirm(page).click();
    await expect(car).toContainText('Associado a Seguro do Carro');
    await page.getByTestId('occ-google').getByRole('button',{name:'Adicionar ao plano'}).click();
    await expect(page.getByTestId('occ-google')).toContainText('Adicionado ao plano');
    await page.getByTestId('occ-prime').getByRole('button',{name:'Dispensar neste mês'}).click();
    await expect(page.getByTestId('occ-prime')).toContainText('Dispensado neste mês');
    await car.getByRole('button',{name:'Ver no plano'}).click();
    await expect(dialog(page)).toContainText('20/11/2026');
    await expect(dialog(page)).toContainText('Ainda sem registos');
    await page.keyboard.press('Escape');

    await goToScreen(page, 'Modelo Base');
    await page.getByTestId('line-rent').getByRole('button',{name:'Editar',exact:true}).click();
    const name=dialog(page).getByRole('textbox',{name:'Nome',exact:true});
    const amount=dialog(page).getByLabel('Montante habitual (€) · opcional');
    await expect(name).toBeFocused();
    await name.fill(longName);
    if(width!==1366)await page.setViewportSize({width,height:440});
    await amount.fill('abc');
    await confirm(page).click();
    const alert=dialog(page).getByRole('alert');
    await expect(alert).toContainText('montante válido');
    await expect(amount).toHaveAttribute('aria-invalid','true');
    if(width!==1366){
      await expect(confirm(page)).toBeInViewport();
      const footer=await dialog(page).locator('.dialog-footer').boundingBox();
      for(const field of [amount,alert]){
        const box=(await field.boundingBox())!;
        expect(box.y).toBeGreaterThan(0);
        expect(box.y+box.height).toBeLessThan(footer!.y);
      }
      await fits(page);
      if(width===360)await picture(page,'formulario-altura-reduzida',width);
    }
    await amount.fill('99');
    await confirm(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.setViewportSize({width,height});
    await expect(page.getByTestId('line-rent')).toContainText(longName);
    await expect(page.getByTestId('line-rent')).toContainText('99,00');
    await fits(page);
    if(width===390)await picture(page,'modelo',width);
    await newMonth(page).click();
    await expect(dialog(page).getByLabel('Mês',{exact:true})).toHaveValue('2026-12');
    await expect(dialog(page)).toContainText('9 definições do Modelo Base');
    if(width===1366)await picture(page,'abrir-mes',width);
    await dialog(page).getByRole('button',{name:'Abrir mês'}).dblclick();
    await expect(page.locator('.page-heading .eyebrow')).toHaveText('dezembro de 2026');
    await goToScreen(page,'Plano e movimentos');
    await expect(page.getByTestId('line-rent')).toContainText('99,00');
    await expect(page.getByTestId('line-rent')).toContainText('Por realizar');
    await openMonth(page,'2026-11');
    await expect(page.getByTestId('line-rent')).toContainText('85,00');
    await goToScreen(page, 'Pagamentos recorrentes');
    await expect(car).toContainText('Associado a Seguro do Carro');
    await expect(page.getByTestId('occ-google')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

async function read(api:APIRequestContext,period?:string){
  const response=await api.get('/api/state'+(period?`?period=${period}`:''));
  expect(response.ok()).toBe(true);
  return await response.json() as {revision:number;state:State};
}
async function send(api:APIRequestContext,action:Action){
  const before=await read(api);
  const response=await api.post('/api/state',{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL!},data:{period:before.state.selected,revision:before.revision,requestId:crypto.randomUUID(),action}});
  expect(response.ok(),await response.text()).toBe(true);
}

test('grava agenda, data e plano inicial, reabre e preserva os saldos',async({page,request})=>{
  test.skip(process.env.OMEUMES_E2E_ISOLATED!=='1','Usar apenas a base criada pelo executor de testes.');
  const period='9995-02';
  const base={id:'phase4-base',name:'Seguro de teste',kind:'expense' as const,accountId:'act-r',categoryId:'cat-seguros',plan:8500};
  await send(request,{type:'line',target:'base',line:base});
  await send(request,{type:'reserve',reserve:{id:'phase4-reserve',name:'Reserva de teste',accountId:'moey-r'}});
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page, 'Pagamentos recorrentes');
  for(const definition of [
    {name:longName,date:'2024-02-29',frequency:'annual'},
    {name:'Serviço mensal fictício',date:'2026-01-31',frequency:'monthly'},
    {name:'Lembrete a dispensar',date:'2026-01-30',frequency:'monthly'},
  ]){
    await page.getByRole('button',{name:'Novo recorrente'}).click();
    await dialog(page).getByRole('textbox',{name:'Nome',exact:true}).fill(definition.name);
    await dialog(page).getByLabel('Data de referência').fill(definition.date);
    await dialog(page).getByLabel('Periodicidade').selectOption(definition.frequency);
    await expect(dialog(page).getByLabel('Conta (opcional)',{exact:true})).toHaveValue('');
    await confirm(page).click();
    await expect(dialog(page)).toHaveCount(0);
  }
  await openMonth(page,period,true);
  const opened=(await read(request,period)).state.months[period];
  expect(opened.events).toEqual([]);
  expect(Object.values(opened.initials).every(v=>v===null)).toBe(true);
  await goToScreen(page, 'Contas');
  const account=page.locator('.account-card').filter({hasText:'ActivoBank A'});
  await account.getByRole('button',{name:'Introduzir saldo inicial'}).click();
  await dialog(page).getByLabel('Saldo inicial deste mês (€)').fill('300');
  await confirm(page).click();
  await expect(account.locator('.balance-value')).toContainText('300,00');
  await goToScreen(page, 'Pagamentos recorrentes');
  const occurrence=(name:string)=>page.locator('.recurring-row').filter({has:page.getByRole('heading',{name,exact:true})});
  const annual=occurrence(longName);
  await expect(annual).toContainText('28/02/9995');
  await expect(annual).toContainText('Por indicar');
  await expect(annual).toContainText('Conta por indicar');
  await annual.getByRole('button',{name:'Adicionar ao plano'}).click();
  await expect(annual).toContainText('Adicionado ao plano');
  await occurrence('Serviço mensal fictício').getByRole('button',{name:'Associar a movimento existente'}).click();
  await dialog(page).getByLabel('Movimento existente').selectOption(base.id);
  await confirm(page).click();
  await expect(occurrence('Serviço mensal fictício')).toContainText('Associado a Seguro de teste');
  await occurrence('Lembrete a dispensar').getByRole('button',{name:'Dispensar neste mês'}).click();
  await expect(occurrence('Lembrete a dispensar')).toContainText('Dispensado neste mês');
  await goToScreen(page, 'Plano e movimentos');
  await page.locator('.movement').filter({hasText:longName}).getByRole('button',{name:'Pagar',exact:true}).click();
  await expect(dialog(page).getByRole('alert')).toHaveCount(0);
  await expect(dialog(page).getByLabel('Montante (€)',{exact:true})).toHaveValue('');
  await expect(dialog(page).getByLabel('Origem do dinheiro',{exact:true})).toHaveValue('');
  await dialog(page).getByRole('button',{name:'Cancelar',exact:true}).click();
  await goToScreen(page,'Mês');
  await page.getByRole('button',{name:'Guardar plano inicial'}).click();
  await expect(page.getByRole('button',{name:'Referência preservada'})).toBeDisabled();
  const original=(await read(request,period)).state.months[period];
  expect(original.lines.filter(l=>l.name===longName)).toHaveLength(1);
  expect(original.events).toEqual([]);
  expect(original.initials['a:act-r']).toBe(30000);
  expect(original.snapshot?.reminderDates?.[base.id]).toBe('9995-02-28');

  await goToScreen(page, 'Modelo Base');
  await page.getByTestId('line-phase4-base').getByRole('button',{name:'Editar',exact:true}).click();
  await dialog(page).getByLabel('Montante habitual (€) · opcional').fill('99');
  await send(request,{type:'line',target:'base',line:{...base,plan:9000}});
  await expect(page.getByTestId('line-phase4-base')).toContainText('90,00',{timeout:8000});
  await confirm(page).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Os dados mudaram');
  await expect(dialog(page).getByLabel('Montante habitual (€) · opcional')).toHaveValue('99');
  await dialog(page).getByRole('button',{name:'Recarregar para voltar a editar'}).click();
  await page.getByTestId('line-phase4-base').getByRole('button',{name:'Editar',exact:true}).click();
  await expect(dialog(page).getByLabel('Montante habitual (€) · opcional')).toHaveValue('90,00');
  await dialog(page).getByLabel('Montante habitual (€) · opcional').fill('99');
  await confirm(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await openMonth(page,'9996-02');
  await goToScreen(page,'Plano e movimentos');
  await expect(page.getByTestId('line-phase4-base')).toContainText('99,00');
  await goToScreen(page, 'Pagamentos recorrentes');
  await expect(annual).toContainText('29/02/9996');
  await expect(page.locator('.definition-row').filter({hasText:longName})).toContainText('29/02/2024');
  await openMonth(page,period);
  await page.reload();
  await page.getByLabel('Mês selecionado').selectOption(period);
  await goToScreen(page,'Plano e movimentos');
  await expect(page.getByTestId('line-phase4-base')).toContainText('85,00');
  await goToScreen(page, 'Contas');
  await expect(account.locator('.balance-value')).toContainText('300,00');
  await goToScreen(page, 'Pagamentos recorrentes');
  await expect(annual).toContainText('Adicionado ao plano');
  await expect(annual).toContainText('28/02/9995');
  expect((await read(request,period)).state.months[period]).toEqual(original);

  const definition=page.locator('.definition-row').filter({hasText:longName});
  await definition.getByRole('button',{name:'Editar',exact:true}).click();
  await dialog(page).getByLabel('Data de referência').fill('2024-02-28');
  await dialog(page).getByLabel('Poupança usada para pagar (opcional)').selectOption('phase4-reserve');
  await expect(dialog(page).getByLabel('Conta (opcional)',{exact:true})).toHaveValue('Moey! A');
  await dialog(page).getByLabel('Gerar lembretes nos novos meses').uncheck();
  await confirm(page).click();
  await expect(definition).toContainText('Inativo');
  await expect(definition).toContainText('Reserva de teste');
  await expect(annual).toContainText('28/02/9995');
  await openMonth(page,'9997-02');
  await expect(annual).toHaveCount(0);
});
