import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from './application';
import { goToScreen } from './navigation';

for (const width of [1366, 360, 390]) {
  test(`o titular do espaço só vê as definições financeiras a ${width} px`, async ({
    page,
    finance,
    application,
  }) => {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 });
    await page.goto('/');
    await goToScreen(page, 'Definições');
    await expect(page.getByRole('region', { name: 'Dados locais' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Criar backup|Exportar dados/ })).toHaveCount(0);
    for (const action of ['backup', 'export']) {
      const response = await finance.api.post('/api/local-files', {
        headers: finance.headers,
        params: { action, spaceId: finance.spaceId },
      });
      expect(response.status()).toBe(403);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(await response.text()).not.toMatch(/\.sqlite|"accounts"|"months"|"path"/);
    }
    expect(existsSync(join(dirname(application.database), 'backups'))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
