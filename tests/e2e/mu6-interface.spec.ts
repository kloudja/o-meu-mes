import type { Locator } from '@playwright/test';
import { expect, test } from './application';
import { goToScreen } from './navigation';

// These controls have opaque backgrounds or transparent ancestors above a solid surface.
async function contrast(locator: Locator, pseudo: string | null = null) {
  await expect(locator).toBeVisible();
  return locator.evaluate((node, pseudo) => {
    function luminance(color: string) {
      const channels = color.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
      if (!channels) throw new Error('A amostra exige uma cor RGB opaca.');
      const [r, g, b] = channels.slice(1).map((value) => {
        const s = Number(value) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    let surface: Element | null = node;
    while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') {
      surface = surface.parentElement;
    }
    const a = luminance(getComputedStyle(node, pseudo).color);
    const b = luminance(surface ? getComputedStyle(surface).backgroundColor : 'rgb(255, 255, 255)');
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, pseudo);
}

test.use({ rightsTest: true });
for (const width of [390, 1366]) {
  test(
    'MU6 contraste do texto e cabeçalhos nas vistas renderizadas a ' + width,
    async ({ page, openExamples, browser, application }, info) => {
      const viewport = { width, height: width === 390 ? 844 : 768 };
      await page.setViewportSize(viewport);
      const publicPage = await browser.newPage({ viewport, storageState: { cookies: [], origins: [] } });
      try {
        const samples: Record<string, number> = {};
        for (const path of ['/', '/privacidade']) {
          const response = await publicPage.goto(application.url + path);
          expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
          expect(response?.headers()['x-content-type-options']).toBe('nosniff');
          samples[path] = await contrast(publicPage.getByRole('heading', { level: 1 }));
        }
        await openExamples(page);
        samples.mes = await contrast(page.getByRole('heading', { name: 'Mês', exact: true }).first());
        await goToScreen(page, 'Definições');
        samples.partilha = await contrast(page.getByRole('heading', { name: 'Partilha', exact: true }));
        await page.getByRole('button', { name: 'Definições do utilizador' }).click();
        const panel = page.locator('.privacy-panel').filter({ hasText: 'Privacidade e direitos' });
        samples.direitos = await contrast(panel.getByRole('button', { name: 'Atualizar pedidos' }));
        samples.ajuda = await contrast(panel.getByLabel('O teu pedido'), '::placeholder');
        await info.attach('contrastes', { body: JSON.stringify(samples), contentType: 'application/json' });
        console.info('MU6 contraste', width, samples);
        for (const ratio of Object.values(samples)) expect(ratio).toBeGreaterThanOrEqual(4.5);
      } finally {
        await publicPage.close();
      }
    },
  );
}
