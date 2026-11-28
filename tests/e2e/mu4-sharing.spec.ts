import { DatabaseSync } from 'node:sqlite';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, syntheticCredentials, test } from './identity-application';
import { createTestSpace, registerOwner } from './application';
import { goToScreen } from './navigation';

const period = '2026-11';
const selectSpace = (page: Page) => page.getByLabel('Espaço', { exact: true });
const profile = (page: Page) => page.getByRole('button', { name: 'Definições do utilizador' });
const sharePanel = (page: Page) => page.getByRole('region', { name: 'Partilha' });
const challengeCode = (message: string) => message.match(/Código: ([\w-]{43})/)![1];

async function share(api: APIRequestContext, url: string, account: string, spaceId: string, data: object) {
  const response = await api.post(url + '/api/sharing?spaceId=' + spaceId, {
    headers: { Origin: url, 'X-Account': account },
    data,
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

for (const width of [1366, 390]) {
  test(`MU4 partilha, consentimento, histórico e revogação a ${width} px`, async ({
    application,
    page,
    browser,
  }, info) => {
    const viewport = { width, height: width === 390 ? 844 : 768 };
    await page.setViewportSize(viewport);
    const ownerData = syntheticCredentials();
    const api = page.request;
    const owner = await registerOwner(api, application, ownerData);
    const finance = await createTestSpace(api, application.url, owner, 'Casa de ensaio');
    await finance.setup(
      [
        { type: 'month', period },
        {
          type: 'account',
          account: { id: 'bank', name: 'Banco de ensaio', restricted: false, color: '#406958' },
        },
        { type: 'category', category: { id: 'home', name: 'Casa' } },
        { type: 'initial', source: 'a:bank', amount: 120_000 },
        {
          type: 'line',
          line: {
            id: 'weekly',
            name: 'Compras semanais',
            kind: 'expense',
            accountId: 'bank',
            categoryId: 'home',
            variable: true,
            plan: 6000,
          },
        },
        {
          type: 'execute',
          lineId: 'weekly',
          date: period + '-09',
          amount: 1540,
          complete: false,
          source: 'a:bank',
          description: 'Compra anterior ao convite',
        },
      ],
      period,
    );
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => true });
      Object.defineProperty(navigator, 'share', {
        value: async () => {
          throw new DOMException('cancelamento sintético', 'AbortError');
        },
      });
    });
    const guestContext = await browser.newContext({ viewport, hasTouch: width === 390, locale: 'pt-PT' });
    try {
      const guestData = {
        ...syntheticCredentials(),
        email: 'bruno.qa@example.invalid',
        firstName: 'Bruno',
        lastName: 'Sintético',
      };
      const guest = await registerOwner(guestContext.request, application, guestData);
      const personal = await createTestSpace(guestContext.request, application.url, guest, 'Espaço do Bruno');
      await personal.setup([{ type: 'month', period }], period);
      await page.goto('/');
      await goToScreen(page, 'Definições');
      const panel = sharePanel(page);
      await expect(page.getByRole('heading', { name: 'Partilha', exact: true })).toHaveCount(1);
      await expect(panel.getByText('Espaço privado', { exact: false }).first()).toBeVisible();
      await page.screenshot({ path: info.outputPath(`mu4-partilha-${width}.png`), animations: 'disabled' });
      await panel.getByLabel('Email da pessoa convidada').fill(guestData.email);
      await panel.getByLabel('Papel no convite').selectOption('editor');
      await panel.getByRole('button', { name: 'Gerar código', exact: true }).click();
      const invite = panel.getByLabel('Mensagem do convite');
      await expect(invite).toBeVisible();
      await expect(panel.getByText('Espaço privado', { exact: false }).first()).toBeVisible();
      const message = await invite.inputValue();
      const token = challengeCode(message);
      expect(message).toContain('todo o histórico');
      expect(message).toContain(application.url + '/privacidade');
      expect(message).not.toContain('Compras semanais');
      expect(message).not.toContain(guestData.email);
      expect(page.url()).not.toContain(token);
      await panel.getByRole('button', { name: 'Copiar mensagem' }).click();
      await expect(
        panel.getByRole('status', { name: '' }).filter({ hasText: 'Mensagem copiada.' }),
      ).toBeVisible();
      const copied = await page.evaluate(async () =>
        (await navigator.clipboard.readText()).replaceAll('\r\n', '\n'),
      );
      expect(copied === message).toBe(true);
      await panel.getByRole('button', { name: 'Partilhar…' }).click();
      await expect(panel.getByText('Partilha cancelada ou indisponível.', { exact: false })).toBeVisible();
      for (const target of ['Email', 'WhatsApp', 'Telegram']) {
        expect(
          await panel.getByRole('link', { name: target, exact: true }).getAttribute('href'),
        ).not.toContain(token);
      }
      await invite.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`mu4-mensagem-${width}.png`), animations: 'disabled' });
      await panel.getByRole('button', { name: 'Ocultar código' }).click();
      await expect(invite).toHaveCount(0);
      const privacy = await page.request.get(application.url + '/privacidade');
      expect(await privacy.text()).toContain('Privacidade dos convites');

      const guestPage = await guestContext.newPage();
      await guestPage.goto(application.url);
      await expect(selectSpace(guestPage)).toHaveValue(personal.spaceId);
      await guestPage.getByRole('button', { name: 'Novo mês' }).click();
      const draft = guestPage.getByRole('dialog');
      await draft.locator('input[type=month]').fill('2027-01');
      const settingsPage = await guestContext.newPage();
      await settingsPage.goto(application.url);
      await profile(settingsPage).click();
      await settingsPage.getByLabel('Código de convite').fill(token);
      await settingsPage.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
      await expect(settingsPage.getByText('Convite aceite.', { exact: false })).toBeVisible();
      await settingsPage.getByRole('button', { name: 'Voltar aos espaços' }).click();
      await expect(selectSpace(settingsPage)).toHaveValue(personal.spaceId);
      await settingsPage.close();
      await guestPage.bringToFront();
      await expect(selectSpace(guestPage)).toHaveValue(personal.spaceId);
      await expect(draft.locator('input[type=month]')).toHaveValue('2027-01');
      await draft.getByRole('button', { name: 'Fechar diálogo' }).click();
      await selectSpace(guestPage).selectOption(finance.spaceId);
      await goToScreen(guestPage, 'Plano e movimentos');
      await guestPage.getByRole('button', { name: 'Detalhe de Compras semanais' }).click();
      await expect(guestPage.getByText('Compra anterior ao convite')).toBeVisible();
      await guestPage.getByRole('button', { name: 'Fechar diálogo' }).click();
      await guestPage.getByRole('button', { name: 'Registar', exact: true }).first().click();
      await expect(guestPage.getByRole('dialog')).toBeVisible();
      await expect(panel.getByText('Espaço partilhado', { exact: false }).first()).toBeVisible();
      await panel.getByLabel('Papel de Bruno Sintético').selectOption('reader');
      await panel.getByRole('button', { name: 'Guardar papel' }).click();
      await expect(guestPage.getByText('O teu papel mudou para leitor.', { exact: false })).toBeVisible({
        timeout: 12_000,
      });
      await expect(guestPage.getByRole('dialog')).toHaveCount(0);
      await goToScreen(guestPage, 'Plano e movimentos');
      await expect(guestPage.getByRole('button', { name: 'Registar', exact: true }).first()).toBeDisabled();
      await guestPage.getByRole('button', { name: 'Detalhe de Compras semanais' }).click();
      await expect(guestPage.getByText('Compra anterior ao convite')).toBeVisible();
      await guestPage.screenshot({
        path: info.outputPath(`mu4-leitor-${width}.png`),
        animations: 'disabled',
      });
      const readerDetails = guestPage.getByRole('dialog');
      await expect(
        readerDetails.getByRole('button', { name: /Editar plano atual|Corrigir|Anular/ }),
      ).toHaveCount(0);
      await panel.getByRole('button', { name: 'Remover acesso' }).click();
      await panel.getByRole('button', { name: 'Confirmar remoção' }).click();
      await expect(guestPage.getByText('Deixaste de ter acesso ao espaço.', { exact: false })).toBeVisible({
        timeout: 12_000,
      });
      await expect(guestPage.getByRole('dialog')).toHaveCount(0);
      await expect(guestPage.getByText('Compra anterior ao convite')).toHaveCount(0);
      await expect(selectSpace(guestPage)).toHaveValue('');
      await expect(panel.getByText('Espaço privado', { exact: false }).first()).toBeVisible();
      const db = new DatabaseSync(application.database, { readOnly: true, timeout: 5000 });
      try {
        expect(db.prepare('SELECT count(*) AS n FROM events WHERE space_id=?').get(finance.spaceId)?.n).toBe(
          1,
        );
      } finally {
        db.close();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await guestContext.close();
    }
  });
}

async function fillRegistration(page: Page, data: ReturnType<typeof syntheticCredentials>) {
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Primeiro nome').fill(data.firstName);
  await page.getByLabel('Último nome').fill(data.lastName);
  await page.getByLabel('Email', { exact: true }).fill(data.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(data.password);
  await page.getByLabel('País de residência').selectOption('PT');
  await page.getByText('Declaro que tenho 18 anos ou mais.').click();
  await page.getByText('Aceito os Termos de utilização de desenvolvimento.').click();
}

test('MU4 registo por convite preserva intenção até à verificação e pode retirar um código inválido', async ({
  application,
  browser,
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const owner = await registerOwner(page.request, application, syntheticCredentials());
  const finance = await createTestSpace(page.request, application.url, owner, 'Espaço de adesão');
  const guest = { ...syntheticCredentials(), email: 'convidada.qa@example.invalid' };
  const invite = await share(page.request, application.url, owner, finance.spaceId, {
    action: 'issue',
    email: guest.email,
    role: 'reader',
  });
  const context = await browser.newContext({ locale: 'pt-PT', viewport: { width: 390, height: 844 } });
  try {
    const entry = await context.newPage();
    await entry.goto(application.url);
    await fillRegistration(entry, guest);
    const codeField = entry.getByLabel('Código de convite');
    await expect(codeField).toBeHidden();
    await entry.getByText('Tenho um código de convite').click();
    await codeField.fill('codigo-errado');
    await entry.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await expect(codeField).toHaveAttribute('aria-invalid', 'true');
    await expect(codeField).toBeFocused();
    await expect(entry.getByLabel('Email', { exact: true })).toHaveValue(guest.email);
    await entry.screenshot({ path: info.outputPath('mu4-registo-erro-390.png'), animations: 'disabled' });
    await entry.getByRole('button', { name: 'Retirar código' }).click();
    await expect(codeField).toBeHidden();
    await entry.getByText('Tenho um código de convite').click();
    await expect(codeField).toHaveValue('');
    await codeField.fill(invite.code);
    await entry.getByLabel('Palavra-passe', { exact: true }).fill(guest.password);
    await entry.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await expect(entry.getByText('Se o registo for novo', { exact: false })).toBeVisible();
    const db = new DatabaseSync(application.database, { readOnly: true, timeout: 5000 });
    try {
      expect(db.prepare('SELECT status FROM space_invites WHERE id=?').get(invite.id)?.status).toBe(
        'pending',
      );
      expect(
        db.prepare('SELECT count(*) AS n FROM memberships WHERE space_id=?').get(finance.spaceId)?.n,
      ).toBe(1);
    } finally {
      db.close();
    }
    await entry.goto(await application.emailLink(guest.email, 'verify'));
    await entry.getByLabel('Palavra-passe').fill(guest.password);
    await entry.getByRole('button', { name: 'Confirmar email', exact: true }).click();
    await expect(entry.getByText('Email confirmado e convite aceite.', { exact: false })).toBeVisible();
    await entry.getByLabel('Email', { exact: true }).fill(guest.email);
    await entry.getByLabel('Palavra-passe', { exact: true }).fill(guest.password);
    await entry.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(selectSpace(entry)).toHaveValue(finance.spaceId);
    await expect(entry.getByRole('heading', { name: 'Ainda sem meses' })).toBeVisible();
    await expect(entry.getByText('Poderás consultar os meses quando forem criados.')).toBeVisible();
    await expect(entry.getByRole('button', { name: /^Mês selecionado / })).toHaveCount(0);
    await expect(entry.getByRole('button', { name: 'Criar primeiro mês' })).toHaveCount(0);
    await expect(entry.getByRole('button', { name: 'Verificar confirmação' })).toHaveCount(0);
    await entry.screenshot({ path: info.outputPath('sem-meses-leitor.png'), animations: 'disabled' });
    await sharePanel(entry).getByText('Sair do espaço', { exact: true }).click();
    await sharePanel(entry).getByRole('button', { name: 'Confirmar saída' }).click();
    await expect(entry.getByRole('heading', { name: 'Sem espaços' })).toBeVisible();
    await expect(
      entry.getByRole('button', { name: 'Aceitar convite nas definições da conta' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('MU4 proposta explícita e aceitação de propriedade no navegador', async ({
  application,
  browser,
  page,
}, info) => {
  const origin = application.url;
  const ownerData = syntheticCredentials();
  const owner = await registerOwner(page.request, application, ownerData);
  const finance = await createTestSpace(page.request, origin, owner, 'Casa com novo proprietário');
  const guestContext = await browser.newContext({ locale: 'pt-PT', viewport: { width: 390, height: 844 } });
  try {
    const guestData = {
      ...syntheticCredentials(),
      email: 'carla.qa@example.invalid',
      firstName: 'Carla',
      lastName: 'Sintética',
    };
    const guest = await registerOwner(guestContext.request, application, guestData);
    const invite = await share(page.request, origin, owner, finance.spaceId, {
      action: 'issue',
      email: guestData.email,
      role: 'reader',
    });
    await share(guestContext.request, origin, guest, finance.spaceId, {
      action: 'acceptInvite',
      code: invite.code,
    });
    await page.goto(origin);
    const panel = sharePanel(page);
    await panel.getByText('Propor transferência', { exact: true }).click();
    await panel.getByLabel('Novo proprietário').selectOption(guest);
    await panel.getByLabel('Palavra-passe').fill(ownerData.password);
    await panel.getByRole('button', { name: 'Confirmar proposta' }).click();
    await expect(panel.getByText('A aguardar resposta de Carla Sintética.', { exact: false })).toBeVisible();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(origin);
    const guestPanel = sharePanel(guestPage);
    await expect(guestPanel.getByRole('button', { name: 'Aceitar propriedade' })).toBeVisible();
    await guestPanel.getByRole('heading', { name: 'Transferência de propriedade' }).scrollIntoViewIfNeeded();
    await guestPage.screenshot({
      path: info.outputPath('mu4-transferencia-390.png'),
      animations: 'disabled',
    });
    await guestPanel.getByRole('button', { name: 'Aceitar propriedade' }).click();
    await expect(guestPanel.getByRole('heading', { name: 'Convidar alguém' })).toBeVisible();
    await expect(panel.getByText('Ana Maria Silva Reis', { exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Convidar alguém' })).toHaveCount(0, { timeout: 12_000 });
  } finally {
    await guestContext.close();
  }
});
