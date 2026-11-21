// Opt-in check of the browser's own vault in a disposable profile.
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, firefox } from '@playwright/test';
import { expect, syntheticCredentials, test } from './identity-application';

test('login com credencial sintética guardada no gestor nativo', async ({ application }) => {
  const manager = process.env.OMEUMES_QA_MANAGER;
  const urls: Record<string, string> = {
    chrome: 'chrome://password-manager/passwords',
    brave: 'brave://password-manager/passwords',
    edge: 'edge://wallet/passwords',
    firefox: 'about:logins',
  };
  if (!manager || !urls[manager]) throw new Error('Indique chrome, brave, edge ou firefox em OMEUMES_QA_MANAGER.');
  test.slow();
  const profile = await mkdtemp(join(tmpdir(), 'omeumes-test-native-manager-'));
  const discardProfile = async () => {
    if (dirname(profile) === tmpdir()) await rm(profile, { recursive: true, force: true, maxRetries: 10 });
  };
  const context = await (manager === 'firefox' ? firefox : chromium).launchPersistentContext(profile, {
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: true, locale: 'pt-PT', acceptDownloads: false,
    // Playwright normally disables the Firefox login manager for automation.
    firefoxUserPrefs: { 'signon.rememberSignons': true, 'signon.autofillForms': true },
  }).catch(async error => { await discardProfile(); throw error; });
  try {
    context.setDefaultTimeout(10_000);
    const { url } = application;
    const account = syntheticCredentials();
    const send = (data: Record<string, unknown>) => context.request.post(url + '/api/identity', { headers: { Origin: url }, data });
    await test.step('Criar e confirmar a conta pelo correio de teste', async () => {
      expect((await send({ action: 'register', ...account })).ok()).toBe(true);
      const token = new URL(await application.emailLink(account.email, 'verify')).hash.slice(8);
      expect((await send({ action: 'verify', password: account.password, token })).ok()).toBe(true);
    });
    const managerPage = context.pages()[0];
    await managerPage.goto(urls[manager]);
    if (manager === 'firefox') {
      await managerPage.getByRole('button', { name: 'Add password' }).click();
      await managerPage.getByRole('textbox', { name: /Website address/ }).fill(url);
      await managerPage.getByRole('textbox', { name: 'Username', exact: true }).fill(account.email);
      await managerPage.getByRole('textbox', { name: 'Password', exact: true }).fill(account.password);
      await managerPage.getByRole('button', { name: 'Save', exact: true }).click();
    } else {
      if (manager === 'edge') await managerPage.getByText('Add password', { exact: true }).click();
      else await managerPage.getByRole('button', { name: 'Adicionar', exact: true }).click();
      await managerPage.getByRole('textbox', { name: /site/i }).fill(url);
      await managerPage.getByRole('textbox', { name: 'Nome de utilizador' }).fill(account.email);
      await managerPage.getByRole('textbox', { name: 'Palavra-passe', exact: true }).fill(account.password);
      if (manager === 'edge') await managerPage.getByText('Adicionar', { exact: true }).click();
      else await managerPage.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(managerPage.getByRole('dialog')).toHaveCount(0);
    }
    if (manager === 'brave') {
      await expect(managerPage.getByRole('button', { name: url + ', ver detalhes', exact: true })).toBeVisible();
    }
    const login = await context.newPage();
    await login.goto(url);
    await login.locator('input[autocomplete="current-password"]').waitFor();
    // Chromium exposes filled values to the page after an actual user gesture.
    await login.getByRole('heading').first().click();
    const password = login.locator('input[autocomplete="current-password"]');
    const username = login.locator('input[autocomplete="username"]');
    const filled = async () => (await password.inputValue()) === account.password && (await username.inputValue()) === account.email;
    const automatic = await expect.poll(filled, { timeout: 2_000 }).toBe(true).then(() => true, () => false);
    if (!automatic) {
      await username.click();
      await username.press('ArrowDown');
      await username.press('Enter');
    }
    await expect.poll(filled).toBe(true);
    const [confirmation] = await Promise.all([
      login.waitForResponse(response => response.url() === url + '/api/identity' && response.request().method() === 'POST'),
      login.getByRole('button', { name: 'Entrar', exact: true }).click(),
    ]);
    expect(confirmation.status()).toBe(200);
    await expect(login.getByRole('heading', { name: 'Sem espaços' })).toBeVisible();
    if (process.env.OMEUMES_QA_MANAGER_UPDATE === '1') {
      await test.step('Verificar a credencial que o gestor volta a preencher após alteração na aplicação', async () => {
        const updated = account.password + ' atualizada';
        await login.getByRole('button', { name: 'Definições do utilizador', exact: true }).click();
        const action = login.getByRole('button', { name: 'Alterar palavra-passe', exact: true });
        await action.click();
        await login.locator('input[autocomplete="current-password"]').fill(account.password);
        await login.locator('input[autocomplete="new-password"]').fill(updated);
        await action.click();
        await expect(login.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
        await login.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
        await expect(login.getByRole('heading', { name: 'Entrar' })).toBeVisible();
        await login.reload();
        await login.getByRole('heading', { name: 'Entrar' }).click();
        const currentFill = async () => {
          const value = await password.inputValue();
          return value === updated ? 'atualizada' : value === account.password ? 'anterior' : 'sem correspondência';
        };
        await expect.poll(currentFill).toBe('atualizada');
      });
    }
  } finally {
    try { await context.close(); } finally { await discardProfile(); }
  }
});
