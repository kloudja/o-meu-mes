import type { Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { TOTP } from 'otpauth';
import { expect, syntheticCredentials, test } from './identity-application';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, name: string) => page.locator('form').getByLabel(name, { exact: true });
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });
async function personalAction(page: Page, label: string) {
  const target = button(page, label);
  const avatar = button(page, 'Definições do utilizador');
  await target.or(avatar).first().waitFor();
  if (!(await target.isVisible())) await avatar.click();
  await target.click();
}
async function login(page: Page, email: string, password: string) {
  await field(page, 'Email').fill(email);
  await field(page, 'Palavra-passe').fill(password);
  await button(page, 'Entrar').click();
}

for (const width of [1366, 390]) {
  test(`registo, validação por campo e confirmação a ${width} px`, async ({ page, application }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    const account = syntheticCredentials();
    await page.goto('/');
    await expect(heading(page, 'Entrar')).toBeVisible();
    await expect(field(page, 'Manter sessão')).not.toBeChecked();
    await page.screenshot({ path: info.outputPath('login-' + width + '.png'), animations: 'disabled' });
    await button(page, 'Criar conta').click();
    await expect(field(page, 'Primeiro nome')).toHaveAttribute('autocomplete', 'given-name');
    await expect(field(page, 'Último nome')).toHaveAttribute('autocomplete', 'family-name');
    await expect(field(page, 'Email')).toHaveAttribute('autocomplete', 'username');
    await field(page, 'Primeiro nome').fill(account.firstName);
    await field(page, 'Último nome').fill(account.lastName);
    await field(page, 'Email').fill(account.email);
    await field(page, 'Palavra-passe').fill('curta');
    await field(page, 'País de residência').selectOption('PT');
    await page.getByText('Privacidade · desenvolvimento', { exact: true }).click();
    await expect(page.getByText(/A conta guarda nome, email/)).toBeVisible();
    await button(page, 'Criar conta').click();
    await expect(page.locator('input[name=password]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('input[name=password]')).toHaveValue('');
    await expect(field(page, 'Primeiro nome')).toHaveValue(account.firstName);
    await expect(field(page, 'Email')).toHaveValue(account.email);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: info.outputPath('registo-' + width + '.png'),
      animations: 'disabled',
      fullPage: true,
    });
    // Use a safe test value and the native keyboard clipboard path.
    const password = page.locator('input[autocomplete="new-password"]');
    await field(page, 'Primeiro nome').fill(account.password);
    await field(page, 'Primeiro nome').press('Control+a');
    await field(page, 'Primeiro nome').press('Control+c');
    await password.focus();
    await password.press('Control+v');
    expect((await password.inputValue()) === account.password).toBe(true);
    await field(page, 'Primeiro nome').fill(account.firstName);
    await page.getByRole('checkbox', { name: /tenho 18 anos/ }).check();
    await page.getByRole('checkbox', { name: /Aceito os Termos/ }).check();
    await button(page, 'Criar conta').click();
    await expect(heading(page, 'Entrar')).toBeVisible();
    await login(page, account.email, account.password);
    await expect(heading(page, 'Email por confirmar')).toBeVisible();
    await button(page, 'Reenviar confirmação').click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Aguarda');
    const link = await application.emailLink(account.email, 'verify');
    await page.goto(link);
    await expect(heading(page, 'Confirmar email')).toBeVisible();
    await field(page, 'Palavra-passe').fill(account.password);
    await button(page, 'Confirmar email').click();
    await expect(heading(page, 'Entrar')).toBeVisible();
    await login(page, account.email, account.password);
    await expect(heading(page, 'Sem espaços')).toBeVisible();
    await button(page, 'Definições do utilizador').click();
    await expect(heading(page, account.firstName + ' ' + account.lastName)).toBeVisible();
    await page.screenshot({
      path: info.outputPath('conta-' + width + '.png'),
      animations: 'disabled',
      fullPage: true,
    });
    await personalAction(page, 'Terminar sessão');
    await expect(heading(page, 'Entrar')).toBeVisible();
    await expect(page.getByText(account.email)).toHaveCount(0);
  });
}

test('perder o email, confirmar o novo e substituir o autenticador pelo percurso restrito', async ({
  page,
  application,
}) => {
  const { url } = application;
  const account = syntheticCredentials();
  const api = page.context().request;
  const send = (data: Record<string, unknown>) =>
    api.post(url + '/api/identity', { headers: { Origin: url }, data });
  expect((await send({ action: 'register', ...account })).ok()).toBe(true);
  const token = new URL(await application.emailLink(account.email, 'verify')).hash.slice(8);
  expect((await send({ action: 'verify', token, password: account.password })).ok()).toBe(true);
  await page.goto('/');
  await login(page, account.email, account.password);
  await personalAction(page, 'Gerar códigos de recuperação');
  await field(page, 'Palavra-passe').fill(account.password);
  await personalAction(page, 'Gerar códigos de recuperação');
  await expect(page.locator('.auth-codes li')).toHaveCount(8);
  const code = await page.locator('.auth-codes li code').first().innerText();
  await button(page, 'Já guardei os códigos').click();
  await personalAction(page, 'Terminar sessão');
  await button(page, 'Esqueci-me da palavra-passe').click();
  await button(page, 'Recuperar sem acesso ao email').click();
  await field(page, 'Email').fill(account.email);
  const newEmail = 'ana.nova@example.invalid';
  const newPassword = account.password + ' atualizada';
  await field(page, 'Novo email').fill(newEmail);
  await field(page, 'Código de recuperação').fill(code);
  await button(page, 'Recuperar sem acesso ao email').click();
  await expect(heading(page, 'Entrar')).toBeVisible();
  await page.goto(await application.emailLink(newEmail, 'email'));
  await field(page, 'Nova palavra-passe').fill(newPassword);
  await button(page, 'Confirmar novo email').click();
  await login(page, newEmail, newPassword);
  await personalAction(page, 'Configurar autenticador');
  await field(page, 'Palavra-passe').fill(newPassword);
  await personalAction(page, 'Configurar autenticador');
  const secret = await page.locator('.auth-key code').innerText();
  const authenticator = new TOTP({ secret });
  await expect(field(page, 'Código do autenticador')).toHaveAttribute('inputmode', 'numeric');
  await expect(field(page, 'Código do autenticador')).toHaveAttribute('autocomplete', 'one-time-code');
  await field(page, 'Código do autenticador').fill(authenticator.generate());
  await button(page, 'Confirmar autenticador').click();
  await expect(page.locator('.auth-codes li')).toHaveCount(8);
  const replacement = await page.locator('.auth-codes li code').first().innerText();
  await personalAction(page, 'Terminar sessão');
  await button(page, 'Esqueci-me da palavra-passe').click();
  await button(page, 'Substituir autenticador perdido').click();
  await field(page, 'Email').fill(newEmail);
  await field(page, 'Palavra-passe').fill(newPassword);
  await field(page, 'Código de recuperação').fill(replacement);
  await button(page, 'Substituir autenticador perdido').click();
  await expect(heading(page, 'Substituir autenticador')).toBeVisible();
  await expect(heading(page, 'Segurança da conta')).toHaveCount(0);
  await personalAction(page, 'Configurar autenticador');
  await personalAction(page, 'Configurar autenticador');
  const newKey = await page.locator('.auth-key code').innerText();
  expect(newKey !== secret).toBe(true);
  await field(page, 'Código do autenticador').fill(new TOTP({ secret: newKey }).generate());
  await button(page, 'Confirmar autenticador').click();
  await expect(page.locator('.auth-codes li')).toHaveCount(8);
});

test('rascunho do novo email só regressa à mesma pessoa, sem palavra-passe', async ({
  page,
  application,
}) => {
  const a = syntheticCredentials(),
    b = { ...a, email: 'bruno@example.invalid', firstName: 'Bruno' };
  const api = page.context().request;
  for (const account of [a, b]) {
    const send = (data: object) =>
      api.post(application.url + '/api/identity', { headers: { Origin: application.url }, data });
    expect((await send({ action: 'register', ...account })).ok()).toBe(true);
    const link = await application.emailLink(account.email, 'verify');
    expect(
      (await send({ action: 'verify', token: new URL(link).hash.slice(8), password: account.password })).ok(),
    ).toBe(true);
  }
  async function expire() {
    const db = new DatabaseSync(application.database, { timeout: 3000 });
    try {
      db.prepare('UPDATE sessions SET expires=0').run();
    } finally {
      db.close();
    }
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(heading(page, 'Entrar')).toBeVisible();
  }
  await page.goto('/');
  await login(page, a.email, a.password);
  await personalAction(page, 'Alterar email');
  await field(page, 'Novo email').fill('rascunho@example.invalid');
  await field(page, 'Palavra-passe').fill(a.password);
  await expire();
  await login(page, a.email, a.password);
  await expect(field(page, 'Novo email')).toHaveValue('rascunho@example.invalid');
  await expect(field(page, 'Palavra-passe')).toHaveValue('');
  await expire();
  await login(page, b.email, b.password);
  await expect(heading(page, 'Sem espaços')).toBeVisible();
  await personalAction(page, 'Alterar email');
  await expect(field(page, 'Novo email')).toHaveValue('');
});

test('altera email e palavra-passe e recupera por ligação de uso único', async ({ page, application }) => {
  const a = syntheticCredentials(),
    api = page.context().request;
  const send = (data: object) =>
    api.post(application.url + '/api/identity', { headers: { Origin: application.url }, data });
  expect((await send({ action: 'register', ...a })).ok()).toBe(true);
  const link = await application.emailLink(a.email, 'verify');
  expect(
    (await send({ action: 'verify', token: new URL(link).hash.slice(8), password: a.password })).ok(),
  ).toBe(true);
  await page.goto('/');
  await login(page, a.email, a.password);
  const other = 'nova@example.invalid',
    updated = a.password + ' alterada';
  await personalAction(page, 'Alterar email');
  await field(page, 'Novo email').fill(other);
  await field(page, 'Palavra-passe').fill(a.password);
  await personalAction(page, 'Alterar email');
  await expect(page.getByText(/Alteração pendente para/)).toBeVisible();
  await page.goto(await application.emailLink(other, 'email'));
  await button(page, 'Confirmar novo email').click();
  await login(page, other, a.password);
  await personalAction(page, 'Alterar palavra-passe');
  await expect(field(page, 'Palavra-passe atual')).toHaveAttribute('autocomplete', 'current-password');
  await expect(field(page, 'Nova palavra-passe')).toHaveAttribute('autocomplete', 'new-password');
  await field(page, 'Palavra-passe atual').fill(a.password);
  await field(page, 'Nova palavra-passe').fill(updated);
  await personalAction(page, 'Alterar palavra-passe');
  await personalAction(page, 'Terminar sessão');
  await login(page, other, updated);
  await expect(heading(page, 'Sem espaços')).toBeVisible();
  await personalAction(page, 'Terminar sessão');
  await button(page, 'Esqueci-me da palavra-passe').click();
  await field(page, 'Email').fill(other);
  await button(page, 'Recuperar palavra-passe').click();
  await page.goto(await application.emailLink(other, 'reset'));
  await field(page, 'Nova palavra-passe').fill(a.password + ' reposta');
  await button(page, 'Definir nova palavra-passe').click();
  await login(page, other, a.password + ' reposta');
  await expect(heading(page, 'Sem espaços')).toBeVisible();
});

test.describe('entrega adiada', () => {
  test.use({ testMailbox: false });
  test('a indisponibilidade é apresentada à conta ainda por confirmar', async ({
    page,
    application,
  }, info) => {
    const account = syntheticCredentials();
    const register = await page.context().request.post(application.url + '/api/identity', {
      headers: { Origin: application.url },
      data: { action: 'register', ...account },
    });
    expect(register.ok()).toBe(true);
    await expect
      .poll(async () => {
        const db = new (await import('node:sqlite')).DatabaseSync(application.database, { readOnly: true });
        try {
          return db.prepare('SELECT status FROM mail_jobs').get()?.status;
        } finally {
          db.close();
        }
      })
      .toBe('deferred');
    await page.goto('/');
    await login(page, account.email, account.password);
    await expect(heading(page, 'Email por confirmar')).toBeVisible();
    await expect(page.getByText(/Não precisas de voltar a registar-te/)).toBeVisible();
    await page.screenshot({ path: info.outputPath('entrega-adiada.png'), animations: 'disabled' });
  });
});
