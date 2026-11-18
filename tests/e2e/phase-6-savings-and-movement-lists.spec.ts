import { expect, test } from './application';
import { goToScreen } from './navigation';
import type { State } from '../../src/domain/model';

test('os cabeçalhos ordenam os movimentos e partilham a ordem com os filtros', async ({ page, openExamples }, info) => {
  await openExamples(page);
  await goToScreen(page, 'Plano e movimentos');
  const plan = page.locator('#movement-panel');
  const rows = plan.locator('.movement');
  const sort = (label: RegExp) => plan.getByRole('button', { name: label });
  await sort(/^Plano atual/).click();
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-health');
  await sort(/^Plano atual/).press('Enter');
  await expect(sort(/^Plano atual, ordem decrescente$/)).toBeFocused();
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-food');

  const rent = page.getByTestId('line-rent');
  await rent.getByRole('button', { name: 'Pagar', exact: true }).click();
  await expect(rent).toContainText('Concluída');
  await sort(/^Realizado/).click();
  await expect(rows.last()).toHaveAttribute('data-testid', 'line-rent');
  await sort(/^Falta/).click();
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-rent');
  await sort(/^Movimento \/ conta/).click();
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-health');
  await page.screenshot({ path: info.outputPath('cabecalhos-plano.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sort(/^Plano atual/)).toBeHidden();
  await page.getByRole('button', { name: /^Filtros/ }).click();
  const filters = page.getByRole('dialog');
  const bank = filters.getByRole('combobox', { name: 'Banco', exact: true });
  await expect(filters.getByLabel('Ordenar por')).toHaveValue('name');
  await bank.selectOption('act-r');
  await filters.getByLabel('Ordenar por').selectOption('plan');
  await filters.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-other');
  await page.locator('.plan-toolbar').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('filtros-ativos.png') });

  await page.setViewportSize({ width: 1366, height: 844 });
  await sort(/^Plano atual, ordem crescente$/).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-food');
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(filters.getByRole('combobox', { name: 'Ordem', exact: true })).toHaveValue('desc');
  await expect(bank).toHaveValue('act-r');
  await page.keyboard.press('Escape');
  const activeFilters=page.getByRole('list',{name:'Filtros ativos'});
  await activeFilters.getByRole('button',{name:'Remover filtro: ActivoBank A'}).click();
  await expect(rows).toHaveCount(7);
  await expect(activeFilters.getByRole('button',{name:'Remover filtro: Ordem decrescente'})).toBeVisible();

  await goToScreen(page, 'Modelo Base');
  const base = page.locator('#base-expense');
  const planned = base.getByRole('button', { name: /^Previsto/ });
  await planned.click();
  await expect(base.locator('.movement').first()).toHaveAttribute('data-testid', 'line-health');
  await planned.click();
  await expect(base.locator('.movement').first()).toHaveAttribute('data-testid', 'line-food');
});

test('a sobra de uma despesa pode ser registada como reforço extra e pesquisada em Poupanças',async({page,request,openExamples},info)=>{
  await page.setViewportSize({width:390,height:844});
  await openExamples(page);
  await goToScreen(page,'Plano e movimentos');
  const rent=page.getByTestId('line-rent');
  await rent.getByRole('button',{name:'Detalhe de Habitação'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Parcial ou diferente'}).click();
  await dialog.getByLabel('Montante (€)',{exact:true}).fill('60');
  const remainder=dialog.getByLabel('Para que poupança quer mover a sobra?');
  await expect(remainder).toHaveCount(0);
  await dialog.getByLabel('Concluir por este valor, mesmo que diferente do previsto').check();
  await remainder.selectOption('em');
  await expect(dialog).toContainText(/Sobraram 25,00/);
  await page.screenshot({path:info.outputPath('sobra-despesa.png')});
  await dialog.getByRole('button',{name:'Confirmar registo'}).click();
  await expect(dialog.getByRole('heading',{name:'Poupar'})).toBeVisible();
  await expect(dialog.getByLabel('Montante (€)',{exact:true})).toHaveValue('25,00');
  await expect(dialog.getByLabel('Tipo de reforço')).toHaveValue('extra');
  const before=await (await request.get('/api/state?period=2026-11')).json();
  expect(before.state.months['2026-11'].events).toHaveLength(1);
  await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(rent).toContainText('Concluída');

  await goToScreen(page,'Poupanças');
  const search=page.getByRole('textbox',{name:'Pesquisar poupanças'});
  await search.fill('emergencia');
  await expect(page.locator('.savings-card')).toHaveCount(1);
  const fund=page.locator('#reserve-em');
  await expect(fund.locator('.balance-value')).toContainText('325,00');
  await expect(fund).toContainText('Reforços extra');
  await page.screenshot({path:info.outputPath('pesquisa-poupancas.png')});
  await page.getByRole('button',{name:'Limpar campo de pesquisa'}).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.locator('.savings-card')).toHaveCount(3);
  const {state}=await (await request.get('/api/state?period=2026-11')).json();
  expect(state.months['2026-11'].events.map((event:{deltas:Record<string,number>})=>event.deltas)).toEqual([
    {'a:act-r':-6000},{'a:act-r':-2500,'a:moey-r':2500},{'a:moey-r':-2500,'r:em':2500},
  ]);
});

test('uma despesa usa o saldo observado depois do pagamento e aparece no gasto da poupança', async ({ page, request, openExamples }) => {
  await openExamples(page);
  await goToScreen(page, 'Poupanças');
  const gas = page.locator('#reserve-gas');
  const dialog = page.getByRole('dialog');
  await gas.getByRole('button', { name: 'Quanto quer poupar este mês?' }).click();
  await dialog.getByLabel('Quanto quer poupar este mês? (€)').fill('60');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await goToScreen(page, 'Plano e movimentos');
  const rows = page.locator('#movement-panel .movement');
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-health');
  const filters = page.getByRole('button', { name: /^Filtros/ });
  await filters.click();
  await dialog.getByLabel('Ordenar por').selectOption('plan');
  await dialog.getByRole('combobox', { name: 'Ordem', exact: true }).selectOption('desc');
  await dialog.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(rows.first()).toHaveAttribute('data-testid', 'line-food');

  await goToScreen(page, 'Mês');
  await page.getByRole('button', { name: 'Guardar plano inicial', exact: true }).click();
  await expect(page.getByText(/Plano inicial guardado ·/)).toBeVisible();
  await goToScreen(page, 'Plano e movimentos');
  await page.getByRole('button', { name: 'Adicionar despesa ao plano' }).click();
  await dialog.getByLabel('Nome', { exact: true }).fill('Crédito de exemplo');
  await dialog.getByLabel('Estado do registo').selectOption('done');
  const amount = dialog.getByLabel('Valor total da despesa (€)', { exact: true });
  await amount.fill('15.25');
  await expect(amount).toHaveValue('15,25');
  await expect(dialog.locator('.money-input').first()).toContainText('€');
  await dialog.getByLabel('Banco de onde sai o dinheiro', { exact: true }).fill('Moey');
  await dialog.getByRole('option', { name: 'Moey! B', exact: true }).click();
  await dialog.getByLabel('Poupança usada para pagar (opcional)').selectOption('gas');
  await dialog.getByLabel('Quanto ficou na poupança após a despesa? (€)').fill('44,75');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Pesquisar movimentos' }).fill('Cre');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Crédito de exemplo');
  await page.getByRole('textbox', { name: 'Pesquisar movimentos' }).clear();
  await filters.click();
  await dialog.getByLabel('Agrupar por').selectOption('date');
  await dialog.getByLabel('Adicionado depois do plano inicial').check();
  await dialog.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Crédito de exemplo');
  await expect(page.locator('.movement-group')).toHaveText(/^\d{2}\/11\/2026$/);
  await filters.click();
  await dialog.getByRole('button', { name: 'Limpar filtros' }).click();

  await page.getByRole('tab', { name: 'Poupanças' }).click();
  await expect(rows.filter({ hasText: 'Gasolina' })).toContainText(/Usado da poupança · 15,25/);
  await goToScreen(page, 'Poupanças');
  await expect(gas.locator('.balance-value')).toHaveText(/44,75/);
  await expect(gas.getByText('Retirado este mês', { exact: true }).locator('..')).toContainText('15,25');
  const { state }: { state: State } = await (await request.get('/api/state?period=2026-11')).json();
  const month = state.months['2026-11'];
  expect(month.initials['r:gas']).toBe(6000);
  expect(month.events).toHaveLength(1);
  expect(month.events[0].deltas).toEqual({ 'r:gas': -1525 });
});

test('o plano permite mudar o banco após um reforço parcial e fecha o objetivo cumprido', async ({ page, request, openExamples }, info) => {
  await openExamples(page);
  const dialog = page.getByRole('dialog');
  await goToScreen(page, 'Plano e movimentos');
  await page.getByRole('tab', { name: 'Poupanças' }).click();
  const goal = page.getByTestId('line-save-em');
  const save = goal.getByRole('button', { name: 'Poupar', exact: true });
  await save.click();
  await expect(dialog.getByLabel('Tipo de reforço')).toHaveCount(0);
  await dialog.getByLabel('Montante (€)', { exact: true }).fill('20');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await goal.getByRole('button', { name: 'Detalhe de Fundo Emergência' }).click();
  await dialog.getByRole('button', { name: 'Editar objetivo do mês' }).click();
  const funding = dialog.getByRole('combobox', { name: 'Banco de onde sai o reforço' });
  await funding.fill('Activo');
  await dialog.getByRole('option', { name: 'ActivoBank A', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(goal).toContainText('ActivoBank A');
  await expect(goal).toContainText('Parcial');
  await save.click();
  await expect(dialog.getByLabel('De que banco sai o dinheiro?', { exact: true })).toHaveValue('ActivoBank A');
  const amount = dialog.getByLabel('Montante (€)', { exact: true });
  await amount.fill('85');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Para um reforço extra, abra a poupança.');
  await amount.fill('80');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(goal).toContainText('Objetivo atingido');
  await expect(save).toHaveCount(0);
  await goal.screenshot({ path: info.outputPath('objetivo-atingido.png') });
  await goal.getByRole('button', { name: 'Detalhe de Fundo Emergência' }).click();
  await expect(dialog.getByRole('button', { name: 'Poupar', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const { state }: { state: State } = await (await request.get('/api/state?period=2026-11')).json();
  const month = state.months['2026-11'];
  expect(month.events.map(event => event.deltas)).toEqual([
    { 'a:moey-r': -2000, 'r:em': 2000 },
    { 'a:act-r': -8000, 'a:moey-r': 8000 },
    { 'a:moey-r': -8000, 'r:em': 8000 },
  ]);
  expect(month.lines.find(line => line.id === 'save-em')).toMatchObject({ accountId: 'act-r', reserveId: 'em' });

  await goToScreen(page, 'Poupanças');
  await expect(save).toHaveCount(0);
  await page.locator('#reserve-em').getByRole('button', { name: 'Poupar', exact: true }).click();
  await expect(dialog.getByLabel('Tipo de reforço')).toHaveValue('extra');
});

for (const { amount, actual, deviation, cents, partial } of [
  { amount: '30', actual: '70,00', deviation: '-30,00', cents: 3000, partial: true },
  { amount: '115', actual: '115,00', deviation: '+15,00', cents: 11500, partial: false },
]) {
  test(`concluir reforço do mês por ${amount} € preserva o plano e permite anular`, async ({ page, request, openExamples }, info) => {
    await openExamples(page);
    await goToScreen(page, 'Mês');
    await page.getByRole('button', { name: 'Guardar plano inicial', exact: true }).click();
    await goToScreen(page, 'Plano e movimentos');
    await page.getByRole('tab', { name: 'Poupanças' }).click();
    const goal = page.getByTestId('line-save-em');
    const save = goal.getByRole('button', { name: 'Poupar', exact: true });
    const details = goal.getByRole('button', { name: 'Detalhe de Fundo Emergência' });
    const dialog = page.getByRole('dialog');
    if (partial) {
      await save.click();
      await dialog.getByLabel('Montante (€)', { exact: true }).fill('40');
      await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(goal).toContainText('Parcial');
    }
    await save.click();
    await dialog.getByLabel('Montante (€)', { exact: true }).fill(amount);
    await dialog.getByLabel('Concluir por este valor, mesmo que diferente do previsto').check();
    if (partial) await dialog.screenshot({ path: info.outputPath('concluir-objetivo-dialogo.png') });
    await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(goal).toContainText('Concluído');
    await expect(save).toHaveCount(0);
    await expect(details).toBeFocused();
    await page.reload();
    await goToScreen(page, 'Plano e movimentos');
    await page.getByRole('tab', { name: 'Poupanças' }).click();
    await expect(save).toHaveCount(0);
    if (partial) await goal.screenshot({ path: info.outputPath('concluir-objetivo-linha.png') });
    await details.click();
    const detailValue = (label: string) => dialog.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
    await expect(dialog.locator('dl > div').filter({ hasText: /^Plano inicial/ }).locator('dd')).toContainText('100,00');
    await expect(detailValue('Objetivo do mês')).toContainText('100,00');
    await expect(detailValue('Já poupado para o objetivo')).toContainText(actual);
    await expect(detailValue('Falta poupar')).toContainText('0,00');
    await expect(detailValue('Desvio realizado face ao plano atual')).toContainText(deviation);
    const readEvents = async () => {
      const { state }: { state: State } = await (await request.get('/api/state?period=2026-11')).json();
      return state.months['2026-11'].events;
    };
    expect((await readEvents()).at(-1)).toMatchObject({
      type: 'saving', amount: cents, complete: true, saving: { extra: 0 },
      deltas: { 'a:moey-r': -cents, 'r:em': cents },
    });
    await dialog.getByRole('button', { name: 'Anular', exact: true }).last().click();
    await expect(detailValue('Falta poupar')).toContainText(partial ? '60,00' : '100,00');
    await expect(dialog.getByRole('button', { name: 'Poupar', exact: true })).toBeVisible();
    expect((await readEvents()).at(-1)).toMatchObject({ voided: true });
  });
}

test('concluir por zero aparece no histórico da poupança sem alterar o saldo', async ({ page, openExamples }) => {
  await openExamples(page);
  await goToScreen(page, 'Plano e movimentos');
  await page.getByRole('tab', { name: 'Poupanças' }).click();
  const goal = page.getByTestId('line-save-em');
  await goal.getByRole('button', { name: 'Poupar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Montante (€)', { exact: true }).fill('0');
  await dialog.getByLabel('Concluir por este valor, mesmo que diferente do previsto').check();
  await expect(dialog.getByLabel('De que banco sai o dinheiro?')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(goal).toContainText('Concluído');
  await goToScreen(page, 'Poupanças');
  const reserve = page.locator('#reserve-em');
  await expect(reserve.locator('.balance-value')).toContainText('300,00');
  await reserve.getByText('Histórico da poupança').click();
  await expect(reserve.getByText('Objetivo do mês concluído sem novo reforço')).toBeVisible();
  await reserve.getByRole('button', { name: 'Anular', exact: true }).click();
  await expect(goal.getByRole('button', { name: 'Poupar', exact: true })).toBeVisible();
});
