import type { Page } from '@playwright/test';

export async function goToScreen(page: Page, name: string, touch = false) {
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click();
  const destination = page.getByRole('navigation').getByRole('button', { name, exact: true });
  if (touch) await destination.tap();
  else await destination.click();
}
