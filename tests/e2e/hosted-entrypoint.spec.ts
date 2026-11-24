import { test, expect } from './identity-application';

const origin = 'https://omeumes.example.invalid';
test.use({ applicationOrigin: origin });

test('o domínio configurado apresenta o acesso à aplicação e os assets, incluindo depois de recarregar', async ({
  page, context, application,
}, testInfo) => {
  // Keep the real public Host/Origin and HTTPS browser context while routing
  // exclusively to this test's ephemeral server and disposable database.
  await context.route(origin + '/**', async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    const response = await context.request.fetch(application.url + target.pathname + target.search, {
      method: request.method(),
      headers: { ...request.headers(), host: new URL(origin).host },
      data: request.postDataBuffer() ?? undefined,
    });
    await route.fulfill({ response });
  });
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.status() + ' ' + response.url());
  });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Palavra-passe', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
  expect(failures).toEqual([]);
  const rejected = await context.request.get(application.url, { headers: { host: 'other.example.invalid' } });
  expect(await rejected.text()).not.toContain('<div class="auth-shell"');
  await page.screenshot({ path: testInfo.outputPath('hosted-entrypoint.png') });
});
