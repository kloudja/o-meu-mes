import { goToScreen } from './navigation';
import { expect, test, type Page } from '@playwright/test';
const dialog=(p:Page)=>p.getByRole('dialog');
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const e:string[]=[];errors.set(page,e);page.on('pageerror',x=>e.push(x.message));page.on('console',x=>{if(x.type()==='error')e.push(x.text());});await page.goto('/demo');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');await goToScreen(page,'Plano e movimentos');});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});
async function purchase(p:Page,n:string,source?:string){await p.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await dialog(p).getByLabel('Montante (€)',{exact:true}).fill(n);if(source){await dialog(p).getByLabel('Origem do dinheiro',{exact:true}).fill(source);await dialog(p).getByRole('option',{name:source,exact:true}).click();}await dialog(p).getByRole('button',{name:'Confirmar registo'}).click();}
async function openTotal(p:Page,n:string,source?:string){await p.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await dialog(p).getByLabel('Tipo de registo').selectOption('total');await dialog(p).getByLabel('Total gasto até à data (€)').fill(n);if(source){await dialog(p).getByLabel('Origem do dinheiro',{exact:true}).fill(source);await dialog(p).getByRole('option',{name:source,exact:true}).click();}}
async function detail(p:Page){await p.getByTestId('line-food').getByRole('button',{name:'Detalhe de Comida'}).click();}

for(const width of [1366,390])test(`total entre contas, detalhe sem duplicar e compra nova — ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:768});
  await purchase(page,'40');await openTotal(page,'60','ActivoBank B');await dialog(page).getByRole('button',{name:'Confirmar registo'}).click();
  await openTotal(page,'50');await dialog(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(dialog(page).getByRole('alert')).toContainText('origem não financiou');
  await page.screenshot({path:`docs/capturas/fase-2/total-origem-${width}.png`});
  await dialog(page).getByLabel('Origem do dinheiro',{exact:true}).fill('ActivoBank B');await dialog(page).getByRole('option',{name:'ActivoBank B',exact:true}).click();await dialog(page).getByRole('button',{name:'Confirmar registo'}).click();
  await page.getByTestId('line-food').getByRole('button',{name:'Registar',exact:true}).click();await dialog(page).getByLabel('Tipo de registo').selectOption('detail');
  await dialog(page).getByLabel('Ajuste que já inclui esta compra').selectOption({index:1});await dialog(page).getByLabel('Origem do dinheiro',{exact:true}).fill('ActivoBank B');await dialog(page).getByRole('option',{name:'ActivoBank B',exact:true}).click();await dialog(page).getByLabel('Nome da compra (opcional)').fill('Mercearia');await dialog(page).getByLabel('Montante (€)',{exact:true}).fill('10');
  await page.screenshot({path:`docs/capturas/fase-2/detalhe-incluido-${width}.png`});await dialog(page).getByRole('button',{name:'Confirmar registo'}).dblclick();await expect(page.locator('.toast')).toContainText('gasto e o saldo mantêm-se');
  await detail(page);await expect(dialog(page).locator('.detail-values>div').filter({has:page.getByText('Realizado',{exact:true})})).toContainText('50,00');await expect(dialog(page)).toContainText('Mercearia');await dialog(page).getByRole('button',{name:'Fechar',exact:true}).click();
  await purchase(page,'10');await detail(page);await expect(dialog(page).locator('.detail-values>div').filter({has:page.getByText('Realizado',{exact:true})})).toContainText('60,00');
  const totalRow=dialog(page).locator('.history>div').filter({has:page.getByText('Ajuste conciliado do total acumulado',{exact:true})}).first();await totalRow.getByRole('button',{name:'Anular',exact:true}).click();await expect(dialog(page).getByRole('alert')).toContainText('dependentes');await expect(dialog(page).getByRole('alert')).toBeInViewport({ratio:1});await expect.poll(async()=>{const alert=await dialog(page).getByRole('alert').boundingBox();const footer=await dialog(page).locator('.dialog-footer').boundingBox();return !!alert&&!!footer&&alert.y+alert.height<=footer.y;}).toBe(true);
  await page.screenshot({path:`docs/capturas/fase-2/historico-dependencias-${width}.png`});await dialog(page).getByRole('button',{name:'Fechar',exact:true}).click();await goToScreen(page, 'Contas');
  await expect(page.locator('.account-card').filter({has:page.getByText('ActivoBank A',{exact:true})}).locator('.balance-value')).toContainText('900,00');
  await expect(page.locator('.account-card').filter({has:page.getByText('ActivoBank B',{exact:true})}).locator('.balance-value')).toContainText('240,00');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('desconhecido aparece nos indicadores e na conta; não há Cartão Refeição',async({page})=>{
  await page.getByTestId('line-services').getByRole('button',{name:'Detalhe de Serviços Essenciais'}).click();await dialog(page).getByRole('button',{name:'Editar plano atual'}).click();await dialog(page).getByLabel('Plano atual (€) · opcional').fill('');await dialog(page).getByRole('button',{name:'Confirmar',exact:true}).click();
  await goToScreen(page,'Mês');const metrics=page.getByRole('region',{name:'Resumo mensal'});await expect(metrics).toContainText('Por apurar');await goToScreen(page, 'Contas');
  const account=page.locator('.account-card').filter({has:page.getByText('ActivoBank A',{exact:true})});await expect(account.locator('dl>div').filter({hasText:'Despesas e poupanças por realizar'})).toContainText('Por indicar');await expect(account.locator('dl>div').filter({hasText:'Saldo previsto'})).toContainText('Por indicar');
  await expect(page.getByText('Cartão Refeição',{exact:true})).toHaveCount(0);await expect(page.locator('.account-card')).toHaveCount(6);await page.screenshot({path:'docs/capturas/fase-2/compromisso-desconhecido-1366.png',fullPage:true});
});

test('insuficiência conjunta não grava iniciais; corrigir o mesmo formulário funciona',async({page})=>{
  await page.getByRole('button',{name:'Novo mês',exact:true}).click();await dialog(page).getByLabel('Mês',{exact:true}).fill('2026-12');await dialog(page).getByRole('button',{name:'Abrir mês'}).click();
  await page.getByRole('tab',{name:'Poupanças'}).click();await page.getByTestId('line-save-em').getByRole('button',{name:'Poupar',exact:true}).click();
  await dialog(page).getByLabel('Saldo inicial — Moey! A (€)',{exact:true}).fill('50');await dialog(page).getByLabel(/Saldo inicial — Poupança · Fundo Emergência/).fill('0');await dialog(page).getByRole('button',{name:'Confirmar saldos e registo'}).click();await expect(dialog(page).getByRole('alert')).toContainText('disponíveis');
  await dialog(page).getByLabel('Saldo inicial — Moey! A (€)',{exact:true}).fill('1000');await dialog(page).getByRole('button',{name:'Confirmar saldos e registo'}).click();await goToScreen(page, 'Contas');await expect(page.locator('.account-card').filter({has:page.getByText('Moey! A',{exact:true})}).locator('.balance-value')).toContainText('900,00');
});

test('snapshot conserva nomes após renomear catálogo e execução continua',async({page})=>{
  await goToScreen(page,'Mês');await page.getByRole('button',{name:'Guardar plano inicial',exact:true}).click();await goToScreen(page, 'Definições');const row=page.locator('.catalog-row').filter({hasText:'ActivoBank A'});await row.getByRole('button',{name:'Editar',exact:true}).click();await dialog(page).getByLabel('Nome',{exact:true}).fill('Conta renomeada');await dialog(page).getByRole('button',{name:'Confirmar',exact:true}).click();await goToScreen(page, 'Plano e movimentos');await page.getByTestId('line-rent').getByRole('button',{name:'Pagar',exact:true}).click();await page.getByTestId('line-rent').getByRole('button',{name:'Detalhe de Habitação'}).click();await expect(dialog(page)).toContainText('Referência guardada: Habitação · ActivoBank A');await expect(dialog(page)).toContainText('Concluída');
});

test('conta arquivada continua utilizável no pagamento parcial de uma linha existente',async({page})=>{
  await goToScreen(page, 'Definições');await page.locator('.catalog-row').filter({hasText:'ActivoBank A'}).getByRole('button',{name:'Desativar',exact:true}).click();await goToScreen(page, 'Plano e movimentos');
  await page.getByTestId('line-services').getByRole('button',{name:'Detalhe de Serviços Essenciais'}).click();await dialog(page).getByRole('button',{name:'Parcial ou diferente'}).click();await dialog(page).getByLabel('Montante (€)',{exact:true}).fill('40');await dialog(page).getByRole('button',{name:'Confirmar registo'}).click();await expect(page.getByTestId('line-services')).toContainText('60,00');await expect(page.getByTestId('line-services')).toContainText('Parcial');
});

test('recebimento antes do plano inicial, anulação e novo registo atualizam saldo',async({page})=>{
  await page.getByRole('tab',{name:'Recebimentos extra',exact:false}).click();const line=page.getByTestId('line-income');await line.getByRole('button',{name:'Receber',exact:true}).dblclick();await expect(line).toContainText('Concluído');
  await goToScreen(page, 'Contas');const account=page.locator('.account-card').filter({has:page.getByText('ActivoBank A',{exact:true})});await expect(account.locator('.balance-value')).toContainText('2.150,00');await account.getByText('Ver movimentos da conta').click();await account.getByRole('button',{name:'Anular',exact:true}).click();await expect(account.locator('.balance-value')).toContainText('950,00');
  await goToScreen(page, 'Plano e movimentos');await line.getByRole('button',{name:'Receber',exact:true}).click();await expect(line).toContainText('Concluído');await goToScreen(page,'Mês');await expect(page.getByRole('button',{name:'Guardar plano inicial',exact:true})).toBeEnabled();await goToScreen(page, 'Contas');await expect(account.locator('.balance-value')).toContainText('2.150,00');
});
