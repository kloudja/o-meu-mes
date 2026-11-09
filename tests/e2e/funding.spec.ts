import { goToScreen } from './navigation';
import { expect, test } from '@playwright/test';
for(const width of [1366,390])test(`quanto transferir por conta e preparação sem gravar — ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:768});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/demo');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');await goToScreen(page, 'Contas');
  const launch=page.getByRole('button',{name:'Quanto transferir para cada conta',exact:true});await launch.click();const d=page.getByRole('dialog');
  await expect(d.getByRole('button',{name:'Registar 1 transferência já efetuada'})).toBeVisible();await expect(d.getByTestId('route-act-r-san')).toContainText('ActivoBank A');await expect(d.getByTestId('route-act-r-san')).toContainText('Santander');await expect(d.getByTestId('route-act-r-san')).toContainText('50,00');await page.screenshot({path:`docs/capturas/contas-transferencias/resumo-${width}.png`});
  await d.getByTestId('route-act-r-san').getByRole('button',{name:'Preparar esta transferência'}).click();
  await expect(d.getByLabel('Destino',{exact:true})).toHaveValue('Santander');await expect(d.getByLabel('Montante (€)',{exact:true})).toHaveValue('50,00');await expect(d.getByLabel('Origem',{exact:true})).toHaveValue('ActivoBank A');
  await d.getByRole('button',{name:'Cancelar',exact:true}).click();await launch.click();await expect(d.getByTestId('route-act-r-san')).toContainText('50,00');await d.getByRole('button',{name:'Fechar',exact:true}).click();await expect(launch).toBeFocused();
  await launch.click();await d.getByTestId('route-act-r-san').getByRole('button',{name:'Preparar esta transferência'}).click();await d.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d).toHaveCount(0);await launch.click();await expect(d.getByTestId('route-act-r-san')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('sugestões repartidas mostram a falta que o dinheiro disponível não cobre',async({page})=>{
  await page.goto('/demo');await expect(page.locator('.app-shell')).toHaveAttribute('data-ready','true');
  await goToScreen(page,'Plano e movimentos');await page.getByTestId('line-insurance').getByRole('button',{name:'Detalhe de Seguro do Carro'}).click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'Editar plano atual'}).click();await d.getByLabel('Plano atual (€) · opcional').fill('5000');await d.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d).toHaveCount(0);
  await goToScreen(page, 'Contas');await page.getByRole('button',{name:'Quanto transferir para cada conta',exact:true}).click();
  await expect(d.locator('.funding-route')).toHaveCount(4);await expect(d.getByTestId('route-act-r-san')).toContainText('485,00');await expect(d.getByTestId('route-moey-r-san')).toContainText('900,00');await expect(d.getByTestId('uncovered-san')).toContainText('3.115,00');
  await d.getByTestId('uncovered-san').scrollIntoViewIfNeeded();await page.screenshot({path:'docs/capturas/contas-transferencias/insuficiencia-origens.png'});
});
