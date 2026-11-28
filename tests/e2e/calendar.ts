import { expect, type Locator } from '@playwright/test';

const dates = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'full', timeZone: 'UTC' });

export function calendarDay(calendar: Locator, iso: string) {
  return calendar.getByRole('button', { name: dates.format(new Date(`${iso}T00:00:00Z`)), exact: true });
}

export function calendarPopup(form: Locator) {
  return form.page().getByRole('dialog', { name: 'Calendário', exact: true });
}

export async function chooseDate(form: Locator, iso: string, label = 'Data') {
  const field = form.getByRole('button', { name: label });
  const current = await field.locator('time').getAttribute('datetime');
  const calendar = calendarPopup(form);
  await field.click();
  const monthNumber = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
  const offset = monthNumber(iso) - monthNumber(current!);
  for (let years = Math.floor(Math.abs(offset) / 12); years > 0; years--) {
    await calendar.getByRole('button', { name: offset < 0 ? 'Ano anterior' : 'Ano seguinte' }).click();
  }
  for (let months = Math.abs(offset) % 12; months > 0; months--) {
    await calendar.getByRole('button', { name: offset < 0 ? 'Mês anterior' : 'Mês seguinte' }).click();
  }
  await calendarDay(calendar, iso).click();
  await expect(calendar).toHaveCount(0);
}
