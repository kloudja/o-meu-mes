import { goToScreen } from './navigation';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.skip(process.env.OMEUMES_E2E_ISOLATED !== '1', 'Usar a base isolada de scripts/test-browser.mjs.');

for (const width of [1366, 360, 390]) {
  test.describe(`dados locais a ${width} px`, () => {
    test.use({
      viewport: { width, height: width === 1366 ? 768 : 820 },
      isMobile: width !== 1366, hasTouch: width !== 1366, locale: 'pt-PT',
    });

    test('cria, encontra e exporta a cópia de ensaio e consulta a recuperação', async ({ page }) => {
      await page.goto('/');
      await goToScreen(page, 'Definições');
      const panel = page.getByRole('region', { name: 'Dados locais' });
      const backup = panel.getByRole('button', { name: 'Criar backup' });
      const exportData = panel.getByRole('button', { name: 'Exportar dados' });
      const restore = panel.getByText('Restaurar para outro ficheiro', { exact: true });
      for (const target of [backup, exportData, restore]) {
        expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 1366) {
        let release!: () => void;
        const wait = new Promise<void>(resolve => { release = resolve; });
        const route = '**/api/local-files?action=backup';
        await page.route(route, async request => {
          await wait;
          await request.fulfill({ status: 503, json: { message: 'Não foi possível criar um backup verificado. Verifique a pasta e tente novamente.' } });
        }, { times: 1 });
        await backup.focus();
        await backup.press('Enter');
        try {
          await expect(backup).toBeFocused();
          await expect(backup).toHaveAttribute('aria-disabled', 'true');
          await expect(panel.getByText('A criar e verificar o backup…')).toBeVisible();
        } finally { release(); }
        await expect(panel.getByRole('alert')).toContainText('tente novamente');
        await expect(panel.getByText('Backup verificado', { exact: true })).toHaveCount(0);
        await expect(backup).toBeFocused();
        await page.screenshot({ path: 'docs/capturas/fase-5/backup-falha-1366.png', animations: 'disabled' });
      }
      const result = page.waitForResponse(response => response.url().endsWith('action=backup') && response.ok());
      if (width === 1366) await backup.press('Enter');
      else await backup.tap();
      const { path } = await (await result).json();
      await expect(panel.getByText('Backup verificado', { exact: true })).toBeVisible();
      await expect(panel.locator('code')).toHaveText(path);
      await expect(panel.locator('time')).not.toBeEmpty();
      expect(existsSync(path)).toBe(true);
      const copy = panel.getByRole('button', { name: 'Copiar caminho' });
      expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if (width === 1366) {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await copy.press('Enter');
        await expect(panel.getByText('Caminho copiado.')).toBeVisible();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(path);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1366) await restore.press('Enter');
      else await restore.tap();
      await expect(panel.getByText(/C.*o caminho do backup e escolha um nome novo/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const downloadEvent = page.waitForEvent('download');
      if (width === 1366) await exportData.press('Space');
      else await exportData.tap();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe('o-meu-mes-exportacao.json');
      expect(JSON.parse(readFileSync((await download.path())!, 'utf8'))).toMatchObject({
        format: 'o-meu-mes-export', version: 1, moneyUnit: 'cent',
        categories: expect.arrayContaining([expect.objectContaining({ name: 'Habitação' })]),
      });
      await expect(panel.getByText(/Consulte as transferências do navegador/)).toBeVisible();
      if (width === 1366) {
        await panel.screenshot({ path: 'docs/capturas/fase-5/dados-locais-1366.png', animations: 'disabled' });
      } else {
        await restore.evaluate(element => element.scrollIntoView({ block: 'center' }));
        await page.screenshot({ path: `docs/capturas/fase-5/restauro-${width}.png`, animations: 'disabled' });
        await panel.evaluate(element => { element.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); });
        await page.screenshot({ path: `docs/capturas/fase-5/dados-locais-${width}.png`, animations: 'disabled' });
      }

      await page.goto('/demo');
      await goToScreen(page, 'Definições');
      await expect(page.getByRole('button', { name: 'Repor exemplos', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Criar backup' })).toHaveCount(0);
    });
  });
}
