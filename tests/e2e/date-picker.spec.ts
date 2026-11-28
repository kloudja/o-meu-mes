import { expect, test } from './application';
import { calendarDay, calendarPopup } from './calendar';
import { goToScreen } from './navigation';

const period = '2026-11';

for (const width of [1366, 360]) {
  test.describe(`calendário a ${width} px`, () => {
    test.use({
      viewport: { width, height: 768 },
      hasTouch: width === 360,
      timezoneId: 'Atlantic/Azores',
    });

    test('seleciona a data guardada, cancela mudanças e grava os limites do mês', async ({ page, finance, openExamples }, info) => {
      await openExamples(page);
      const today = await page.evaluate(() => {
        const now = new Date();
        return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
      });
      await goToScreen(page, 'Plano e movimentos');
      const detail = page.getByRole('button', { name: 'Detalhe de Comida' });
      await detail.click();
      const form = page.getByRole('dialog');
      await form.getByRole('button', { name: 'Registar compra / total' }).click();
      const date = form.getByRole('button', { name: /^Data / });
      const calendar = calendarPopup(form);
      const initial = today.startsWith(period) ? today : `${period}-01`;
      await expect(date.locator('time')).toHaveAttribute('datetime', initial);
      await form.getByLabel('Montante (€)', { exact: true }).fill('10');
      await date.press('Enter');
      const defaultDay = calendarDay(calendar, initial);
      await expect(defaultDay).toBeFocused();
      await expect(calendar.getByRole('gridcell', { selected: true })).toContainText(Number(initial.slice(8)).toString());
      const firstDay = calendarDay(calendar, `${period}-01`);
      if (width === 360) await firstDay.tap();
      else await firstDay.click();
      await expect(date.locator('time')).toHaveAttribute('datetime', `${period}-01`);
      await form.getByRole('button', { name: 'Confirmar registo' }).click();
      await expect(form).toHaveCount(0);

      await detail.click();
      await form.getByRole('button', { name: 'Corrigir', exact: true }).click();
      await expect(date).toHaveAccessibleName('Data 01/11/2026');
      await date.click();
      await expect(firstDay).toBeFocused();
      await expect(calendar.getByRole('gridcell', { selected: true })).toHaveText('1');
      const cancel = calendar.getByRole('button', { name: 'Cancelar' });
      await firstDay.press('Shift+Tab');
      await expect(cancel).toBeFocused();
      await cancel.press('Tab');
      await expect(firstDay).toBeFocused();
      await firstDay.press('PageDown');
      await expect(firstDay).toBeFocused();
      await firstDay.press('ArrowLeft');
      await expect(firstDay).toBeFocused();
      await firstDay.press('ArrowDown');
      const moved = calendarDay(calendar, `${period}-08`);
      await expect(moved).toBeFocused();
      await expect(calendar.getByRole('gridcell', { selected: true })).toHaveText('1');
      await page.mouse.move(0, 0);
      await page.screenshot({ path: info.outputPath('corrigir-data.png') });
      await moved.press('Escape');
      await expect(calendar).toHaveCount(0);
      await expect(form).toHaveAccessibleName('Corrigir registo');
      await expect(date).toHaveAccessibleName('Data 01/11/2026');
      await expect(date).toBeFocused();

      await date.press('Space');
      for (const day of [1, 8, 15, 22]) {
        await calendarDay(calendar, `${period}-${String(day).padStart(2, '0')}`).press('ArrowDown');
      }
      await calendarDay(calendar, `${period}-29`).press('ArrowRight');
      const lastDay = calendarDay(calendar, `${period}-30`);
      await expect(lastDay).toBeFocused();
      await lastDay.press('ArrowRight');
      await expect(lastDay).toBeFocused();
      await lastDay.press('Enter');
      await expect(date).toHaveAccessibleName('Data 30/11/2026');
      await form.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(form).toHaveCount(0);
      await page.reload();
      await goToScreen(page, 'Plano e movimentos');
      await detail.click();
      await expect(form.getByText(/30\/11\/2026/).first()).toBeVisible();
      const { state } = await (await finance.read(period)).json();
      expect(state.months[period].events.filter((event: { lineId?: string; date: string; type: string }) =>
        event.lineId === 'food' && event.type === 'execution').map((event: { date: string }) => event.date))
        .toEqual([`${period}-01`, `${period}-30`]);
    });

    test('mantém a data prevista opcional e permite navegar nas datas recorrentes', async ({ page, finance, openExamples }, info) => {
      await openExamples(page);
      await goToScreen(page, 'Plano e movimentos');
      await page.getByRole('button', { name: 'Detalhe de Habitação' }).click();
      const form = page.getByRole('dialog');
      await form.getByRole('button', { name: 'Editar plano atual' }).click();
      const planned = form.getByRole('button', { name: /^Data prevista/ });
      const calendar = calendarPopup(form);
      await expect(planned).toHaveAccessibleName('Data prevista (opcional) Por indicar');
      await planned.click();
      await expect(calendar.getByRole('gridcell', { selected: true })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('data-prevista.png') });
      await calendarDay(calendar, `${period}-30`).click();
      await expect(planned).toHaveAccessibleName('Data prevista (opcional) 30/11/2026');
      await planned.click();
      await calendar.getByRole('button', { name: 'Limpar data' }).click();
      await expect(planned).toHaveAccessibleName('Data prevista (opcional) Por indicar');
      await form.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(form).toHaveCount(0);
      const plannedState = await (await finance.read(period)).json();
      expect(plannedState.state.months[period].lines.find((line: { id: string }) => line.id === 'rent').dueDate).toBeUndefined();

      await goToScreen(page, 'Pagamentos recorrentes');
      const recurring = page.locator('.definition-row').filter({ hasText: 'Amazon Prime' });
      await recurring.getByRole('button', { name: 'Editar' }).click();
      const reference = form.getByRole('button', { name: /^Data de referência/ });
      await expect(reference).toHaveAccessibleName('Data de referência 30/11/2026');
      await reference.click();
      const lastNovember = calendarDay(calendar, '2026-11-30');
      await expect(lastNovember).toBeFocused();
      await lastNovember.press('Shift+PageUp');
      await expect(calendarDay(calendar, '2025-11-30')).toBeFocused();
      await calendar.getByRole('button', { name: 'Ano anterior' }).click();
      await expect(calendarDay(calendar, '2024-11-30')).toBeFocused();
      await calendar.getByRole('button', { name: 'Mês anterior' }).click();
      await expect(calendarDay(calendar, '2024-10-30')).toBeFocused();
      await page.screenshot({ path: info.outputPath('data-recorrente.png') });
      await calendarDay(calendar, '2024-10-31').click();
      await form.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(form).toHaveCount(0);
      const recurringState = await (await finance.read(period)).json();
      expect(recurringState.state.recurring.find((item: { id: string }) => item.id === 'prime').date).toBe('2024-10-31');
    });

    test('transporte da data efetiva para a transferência individual', async ({ page, openExamples }, info) => {
      await openExamples(page);
      await goToScreen(page, 'Contas');
      await page.getByRole('button', { name: /^Quanto transferir para cada conta/ }).click();
      const review = page.getByRole('dialog', { name: 'Quanto transferir para cada conta' });
      const effective = review.getByRole('button', { name: /^Data efetiva/ });
      const calendar = calendarPopup(review);
      const shownDate = await effective.locator('time').getAttribute('datetime');
      await effective.click();
      await expect(calendarDay(calendar, shownDate!)).toBeFocused();
      await page.screenshot({ path: info.outputPath('data-efetiva.png') });
      await calendarDay(calendar, `${period}-30`).click();
      await review.getByRole('button', { name: 'Preparar esta transferência' }).first().click();
      const transfer = page.getByRole('dialog', { name: 'Transferência própria' });
      await expect(transfer.getByRole('button', { name: 'Data 30/11/2026' })).toBeVisible();
    });
  });
}
