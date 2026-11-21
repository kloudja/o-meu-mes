import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Page } from '@playwright/test';
import type { Confirmed, Command } from '../../src/modules/finance/contracts/command';
import { expect, test, FinanceApi, registerOwner } from './application';
import { syntheticCredentials } from './identity-application';
import { goToScreen } from './navigation';

const period = '2028-11';
const lineId = 'mu3-compras';
const description = 'Cabaz novo da Ana';
const dialog = (page: Page) => page.getByRole('dialog');
const confirm = (page: Page) => dialog(page).getByRole('button', { name: 'Confirmar registo', exact: true });
const amount = (page: Page) => dialog(page).getByLabel('Montante (€)', { exact: true });
const purchaseName = (page: Page) => dialog(page).getByLabel('Nome da compra (opcional)');

async function read(finance: FinanceApi) {
  const response = await finance.read(period);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<Confirmed>;
}

async function seed(finance: FinanceApi) {
  await finance.setup(
    [
      { type: 'month', period },
      { type: 'initial', source: 'a:act-r', amount: 10000 },
      {
        type: 'line',
        line: {
          id: lineId,
          name: 'Compras de ensaio',
          kind: 'expense',
          accountId: 'act-r',
          categoryId: '',
          plan: 10000,
          variable: true,
        },
      },
    ],
    period,
  );
}

async function addPurchase(finance: FinanceApi, amount: number, description: string) {
  const observed = await read(finance);
  const response = await finance.command({
    requestId: randomUUID(),
    revision: observed.revision,
    period,
    action: {
      type: 'execute',
      lineId,
      amount,
      description,
      source: 'a:act-r',
      date: period + '-04',
      complete: false,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function openDraft(page: Page) {
  await page.goto('/');
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  await expect(page.getByLabel('Mês selecionado')).toHaveValue(period);
  await goToScreen(page, 'Plano e movimentos');
  await page
    .getByTestId('line-' + lineId)
    .getByRole('button', { name: 'Registar', exact: true })
    .click();
  await amount(page).fill('10,00');
  await purchaseName(page).fill(description);
}

for (const width of [1366, 390]) {
  test(`A33/A36: conflito, rascunho e releitura com falha a ${width} px`, async ({
    application,
    finance,
    page,
    playwright,
    loginSibling,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await seed(finance);
    const api = await playwright.request.newContext({
      baseURL: application.url,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const bruno = await registerOwner(api, application, {
        ...syntheticCredentials(),
        email: 'bruno.mu3@example.invalid',
        firstName: 'Bruno',
        lastName: 'Pessoa',
      });
      const db = new DatabaseSync(application.database, { timeout: 3000 });
      try {
        db.prepare("INSERT INTO memberships(space_id,user_id,role) VALUES(?,?,'editor')").run(
          finance.spaceId,
          bruno,
        );
      } finally {
        db.close();
      }
      const editor = new FinanceApi(api, application.url, bruno, finance.spaceId);
      await loginSibling(page.context());
      await openDraft(page);
      let failRefresh = true;
      await page.route('**/api/state*', async (route) => {
        if (route.request().method() !== 'GET' || !failRefresh) return route.continue();
        await route.fulfill({
          status: 503,
          json: { code: 'STORAGE', message: 'Não foi possível atualizar os dados.' },
        });
      });
      await addPurchase(editor, 1000, 'Cabaz registado pelo Bruno');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      const refresh = dialog(page).getByRole('button', { name: 'Atualizar dados', exact: true });
      await expect(refresh).toBeVisible();
      await expect(dialog(page)).toContainText('Os dados podem estar desatualizados.');
      await expect(amount(page)).toHaveValue('10,00');
      await expect(purchaseName(page)).toHaveValue(description);
      await expect(page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).resolves.toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`mu3-releitura-${width}.png`), animations: 'disabled' });
      failRefresh = false;
      await refresh.click();
      await expect(refresh).toHaveCount(0);
      await expect(purchaseName(page)).toHaveValue(description);
      await confirm(page).click();

      const review = page.getByRole('dialog', { name: 'Possível duplicado' });
      const distinct = review.getByRole('button', {
        name: 'Registar como operação diferente',
        exact: true,
      });
      await expect(distinct).toBeVisible();
      await expect(review).toContainText('Cabaz registado pelo Bruno');
      await expect(review).toContainText('Bruno Pessoa');
      expect((await read(finance)).state.months[period].events).toHaveLength(1);
      await distinct.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`mu3-aviso-${width}.png`), animations: 'disabled' });
      await review.getByRole('button', { name: 'Voltar ao registo', exact: true }).click();
      await expect(review).toHaveCount(0);
      await expect(purchaseName(page)).toHaveValue(description);
      await confirm(page).click();
      await expect(distinct).toBeEnabled();
      await addPurchase(editor, 813, 'Compra feita durante a revisão');
      const [renewed] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/api/state' &&
            response.status() === 409,
        ),
        distinct.click(),
      ]);
      expect(await renewed.json()).toMatchObject({ code: 'DUPLICATE' });
      await expect(distinct).toBeVisible();
      await expect(distinct).toBeEnabled();
      expect((await read(finance)).state.months[period].events).toHaveLength(2);
      await distinct.click();
      await expect(dialog(page)).toHaveCount(0);
      const state = await read(finance);
      expect(state.state.months[period].events.map((event) => event.amount)).toEqual([1000, 813, 1000]);
      expect(state.state.months[period].events[2].description).toBe(description);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await api.dispose();
    }
  });
}

test('A11/A44: fecha pedido sem resposta e resolve resposta perdida sem repetir o pagamento', async ({
  finance,
  page,
}) => {
  await seed(finance);
  await openDraft(page);
  let delivery: 'hold' | 'discard-response' | 'normal' = 'hold';
  let missing: Command | undefined;
  let committed: Command | undefined;
  await page.route('**/api/state*', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || delivery === 'normal') return route.continue();
    if (delivery === 'hold') missing = request.postDataJSON() as Command;
    else {
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBe(true);
      committed = request.postDataJSON() as Command;
    }
    await route.abort('connectionreset');
  });
  await confirm(page).click();
  let verify = dialog(page).getByRole('button', { name: /verificar confirmação|consultar resultado/i });
  await expect(verify).toBeVisible();
  expect(missing).toBeDefined();
  expect((await read(finance)).state.months[period].events).toHaveLength(0);
  await page.reload();
  verify = page.getByRole('button', { name: /verificar confirmação|consultar resultado/i });
  await expect(verify).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await verify.click();
  await expect(verify).toHaveCount(0);
  await expect(page.getByText(/sem efeito/i)).toBeVisible();
  const late = await finance.command(missing!);
  expect(late.status()).toBe(422);
  expect(await late.json()).toMatchObject({ code: 'IDEMPOTENCY' });

  delivery = 'discard-response';
  await goToScreen(page, 'Plano e movimentos');
  await page
    .getByTestId('line-' + lineId)
    .getByRole('button', { name: 'Registar', exact: true })
    .click();
  await amount(page).fill('12,00');
  await purchaseName(page).fill('Compra com resposta perdida');
  await confirm(page).click();
  verify = dialog(page).getByRole('button', { name: /verificar confirmação|consultar resultado/i });
  await expect(verify).toBeVisible();
  expect(committed).toBeDefined();
  expect((await read(finance)).state.months[period].events.map((event) => event.amount)).toEqual([1200]);
  delivery = 'normal';
  await verify.click();
  await expect(dialog(page)).toHaveCount(0);
  const events = (await read(finance)).state.months[period].events;
  expect(events.map((event) => [event.id, event.amount])).toEqual([[committed!.requestId, 1200]]);
});

test('A07: a perda de acesso remove o formulário e a confirmação do espaço', async ({
  application,
  finance,
  page,
  playwright,
}) => {
  await seed(finance);
  const member = { ...syntheticCredentials(), email: 'member-mu3@example.invalid', firstName: 'Bruno' };
  const api = await playwright.request.newContext({
    baseURL: application.url,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const memberId = await registerOwner(api, application, member);
    const db = new DatabaseSync(application.database, { timeout: 3000 });
    try {
      db.prepare("INSERT INTO memberships(space_id,user_id,role) VALUES(?,?,'editor')").run(
        finance.spaceId,
        memberId,
      );
      await page.context().clearCookies();
      const login = await page.request.post('/api/identity', {
        headers: { Origin: application.url },
        data: { action: 'login', email: member.email, password: member.password },
      });
      expect(login.ok()).toBe(true);
      await openDraft(page);
      await page.route('**/api/state*', (route) =>
        route.request().method() === 'POST' ? route.abort() : route.continue(),
      );
      await confirm(page).click();
      await expect(dialog(page).getByRole('button', { name: 'Verificar confirmação' })).toBeVisible();
      db.prepare(`UPDATE memberships SET IsDeleted=1,ModifiedAt='2028-11-04T13:00:00.000Z',
        DeletedAt='2028-11-04T13:00:00.000Z' WHERE space_id=? AND user_id=?`).run(finance.spaceId, memberId);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByLabel('Espaço', { exact: true })).toHaveValue('');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByText('Compras de ensaio')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Verificar confirmação' })).toHaveCount(0);
      expect((await read(finance)).state.months[period].events).toEqual([]);
    } finally {
      db.close();
    }
  } finally {
    await api.dispose();
  }
});

test('histórico paginado mostra data efetiva, autoria e compensação no detalhe', async ({
  finance,
  page,
}, info) => {
  await seed(finance);
  await finance.setup(
    Array.from({ length: 21 }, (_, index) => ({
      type: 'execute' as const,
      lineId,
      amount: 100 + index,
      date: period + '-04',
      source: 'a:act-r',
      complete: false,
      description: 'Compra de arquivo ' + (index + 1),
    })),
    period,
  );
  const observed = await read(finance);
  const original = observed.state.months[period].events.at(-1)!;
  const result = await finance.command({
    period,
    revision: observed.revision,
    requestId: randomUUID(),
    action: { type: 'void', id: original.id },
  });
  expect(result.ok(), await result.text()).toBe(true);
  await page.goto('/');
  await goToScreen(page, 'Plano e movimentos');
  await page.getByRole('button', { name: 'Detalhe de Compras de ensaio' }).click();
  const detail = dialog(page);
  await expect(detail.getByRole('heading', { name: 'Registos e correções' })).toBeVisible();
  await expect(detail.getByText('Compra de arquivo 21', { exact: true })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Seguinte' }).click();
  await expect(detail.getByText('Compra de arquivo 21', { exact: true })).toBeVisible();
  await expect(detail.getByText('Compensação', { exact: true })).toBeVisible();
  await expect(detail.getByText('04/11/2028', { exact: false }).first()).toBeVisible();
  await expect(detail.getByText(/Registado por.*Ana Maria Silva Reis/).first()).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Anular', exact: true })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('historico-compensatorio-1366.png'),
    animations: 'disabled',
  });
  await detail.getByRole('button', { name: 'Anterior' }).click();
  const entry = detail.getByText('Compra de arquivo 1', { exact: true }).locator('../..');
  await entry.getByRole('button', { name: 'Corrigir', exact: true }).click();
  const correction = page.getByRole('dialog', { name: 'Corrigir registo' });
  await correction.getByLabel('Montante (€)', { exact: true }).fill('2,00');
  await correction.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(correction).toHaveCount(0);
  const corrected = (await read(finance)).state.months[period].events.slice(-2);
  expect(corrected.map(({ amount, type }) => [amount, type])).toEqual([
    [-100, 'reversal'],
    [200, 'execution'],
  ]);
  expect(corrected[1].corrects).toBe(corrected[0].reverses);
});
