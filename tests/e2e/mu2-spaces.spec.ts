import { DatabaseSync } from 'node:sqlite';
import { expect, test, syntheticCredentials } from './identity-application';
import { createTestSpace, FinanceApi, registerOwner } from './application';
import { goToScreen } from './navigation';
import type { APIRequestContext, Page, Request } from '@playwright/test';

const periods = ['2026-11', '2026-12'] as const;
const space = (page: Page) => page.getByLabel('Espaço', { exact: true });
const month = (page: Page) => page.getByLabel('Mês selecionado');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function assertPrivateStorage(page: Page, ...privateValues: string[]) {
  const storage = await page.evaluate(() =>
    [localStorage, sessionStorage]
      .flatMap((store) => Object.entries(store).map(([key, value]) => key + ' ' + value))
      .join('\n'),
  );
  expect(storage).not.toMatch(/"action"\s*:|"amount"\s*:|"description"\s*:|omeumes\.pending\.v1/i);
  for (const value of privateValues) expect(storage).not.toContain(value);
}

async function spaceList(api: APIRequestContext, origin: string, owner: string) {
  const response = await api.get(origin + '/api/spaces', { headers: { 'X-Account': owner } });
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
  return (await response.json()).spaces as Array<{ id: string; name: string; currency: string }>;
}

async function currentMonth(finance: FinanceApi, period: string) {
  const response = await finance.read(period);
  expect(response.ok(), await response.text()).toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
  const { state } = await response.json();
  expect(Object.keys(state.months)).toEqual([period]);
  expect(Object.keys(state.requests ?? {})).toEqual([]);
  return state.months[period];
}

function gate() {
  let release!: () => void;
  const closed = new Promise<void>((accept) => {
    release = accept;
  });
  return { closed, release };
}

async function holdFinanceResponse(page: Page, matches: (request: Request) => boolean, pattern = '**/api/state*') {
  let held = false;
  const deliver = gate();
  const done = gate();
  let intercepted = false;
  await page.route(pattern, async (route) => {
    if (!matches(route.request()) || intercepted) return route.continue();
    intercepted = true;
    try {
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBe(true);
      held = true;
      await deliver.closed;
      await route.fulfill({ response });
    } finally {
      done.release();
    }
  });
  return {
    waitUntilHeld: () => expect.poll(() => held, { timeout: 12_000 }).toBe(true),
    release: async () => {
      deliver.release();
      if (held) await done.closed;
    },
  };
}

async function seed(finance: FinanceApi, bank: string, lineName: string) {
  await finance.setup(
    [
      { type: 'month', period: periods[0] },
      { type: 'account', account: { id: 'bank', name: bank, color: '#446677', restricted: false } },
      { type: 'category', category: { id: 'group', name: 'Rubrica de teste' } },
      { type: 'initial', source: 'a:bank', amount: 15837 },
      {
        type: 'line',
        line: {
          id: 'monthly',
          name: lineName,
          kind: 'expense',
          accountId: 'bank',
          categoryId: 'group',
          plan: 1243,
          variable: true,
        },
      },
    ],
    periods[0],
  );
}

test('MU6 a troca de espaço cancela a entrega de uma exportação em curso', async ({ page, application }) => {
  const owner = await registerOwner(page.request, application, syntheticCredentials());
  const first = await createTestSpace(page.request, application.url, owner, 'Primeiro');
  const second = await createTestSpace(page.request, application.url, owner, 'Segundo');
  await first.setup([{ type: 'month', period: periods[0] }], periods[0]);
  await page.goto('/');
  await goToScreen(page, 'Definições');
  await page.getByText('Exportação do espaço', { exact: true }).click();
  const lag = await holdFinanceResponse(page, (r) => r.postDataJSON()?.action === 'download', '**/api/export*');
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  try {
    await button(page, 'Guardar ficheiro JSON').click();
    await lag.waitUntilHeld();
    const aborted = page.waitForEvent('requestfailed', (r) => r.url().includes('/api/export'));
    await space(page).selectOption(second.spaceId);
    await aborted;
  } finally {
    await lag.release();
  }
  await expect(space(page)).toHaveValue(second.spaceId);
  expect(downloads).toEqual([]);
});

for (const width of [1366, 390]) {
  test(`primeiro espaço privado e primeiro mês a ${width} px`, async ({ page, application }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    const api = page.context().request;
    const owner = await registerOwner(api, application, syntheticCredentials());
    expect(await spaceList(api, application.url, owner)).toEqual([]);
    const loading = await holdFinanceResponse(page, (request) => request.method() === 'GET', '**/api/spaces');
    try {
      await page.goto('/');
      await loading.waitUntilHeld();
      await expect(space(page)).toBeDisabled();
    } finally {
      await loading.release();
    }
    await expect(space(page)).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Sem espaços' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`sem-espacos-${width}.png`), animations: 'disabled' });
    if (!(await page.getByLabel('Nome do espaço').isVisible())) await button(page, 'Criar espaço').click();
    await expect(page.getByRole('radio', { name: 'Começar rapidamente' })).toBeChecked();
    if (width === 390) await page.getByRole('radio', { name: 'Configurar agora' }).check();
    await page.getByLabel('Nome do espaço').fill('Espaço privado de ensaio');
    await button(page, 'Criar espaço').last().click();
    await expect(space(page)).toBeVisible();
    await expect(button(page, 'Criar primeiro mês')).toBeVisible();
    const list = await spaceList(api, application.url, owner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Espaço privado de ensaio', currency: 'EUR' });
    const finance = new FinanceApi(api, application.url, owner, list[0].id);
    const { state, periods: available } = await (await finance.read()).json();
    expect(available).toEqual([]);
    expect(state).toMatchObject({
      accounts: [],
      categories: [],
      reserves: [],
      recurring: [],
      base: [],
      months: {},
    });
    await page.screenshot({ path: info.outputPath(`sem-meses-${width}.png`), animations: 'disabled' });
    if (!(await page.locator('input[type=month]').isVisible()))
      await button(page, 'Criar primeiro mês').click();
    await page.locator('input[type=month]').fill(periods[0]);
    await page
      .getByRole('button', { name: /Criar primeiro mês|Abrir mês/ })
      .last()
      .click();
    await expect(month(page)).toHaveValue(periods[0]);
    await expect(space(page)).toHaveValue(list[0].id);
    await expect(page.getByRole('heading', { name: width === 390 ? 'Definições' : 'Mês', exact: true })).toBeVisible();
    const selector = await space(page).boundingBox();
    const avatar = await button(page, 'Definições do utilizador').boundingBox();
    expect(selector && avatar && selector.x + selector.width <= avatar.x).toBe(true);
    expect(await currentMonth(finance, periods[0])).toMatchObject({ events: [], lines: [], initials: {} });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await assertPrivateStorage(page, 'Espaço privado de ensaio');
    await page.screenshot({ path: info.outputPath(`primeiro-mes-${width}.png`), animations: 'disabled' });
    const sibling = await createTestSpace(api, application.url, owner, 'Orçamento alternativo');
    await sibling.setup([{ type: 'month', period: '2026-12' }], '2026-12');
    await page.reload();
    await space(page).selectOption(sibling.spaceId);
    await expect(month(page)).toHaveValue('2026-12');
    await space(page).selectOption(list[0].id);
    await expect(month(page)).toHaveValue(periods[0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  });
}

test('respostas de leitura em atraso respeitam o espaço e o mês atualmente selecionados', async ({
  page,
  application,
}, info) => {
  const api = page.context().request;
  const owner = await registerOwner(api, application, syntheticCredentials());
  const left = await createTestSpace(api, application.url, owner, 'Conta da semana');
  const right = await createTestSpace(api, application.url, owner, 'Conta das férias');
  await seed(left, 'Banco de novembro', 'Despesa visível apenas em novembro');
  await left.setup(
    [
      { type: 'month', period: periods[1] },
      {
        type: 'line',
        line: {
          id: 'december',
          name: 'Despesa exclusiva de dezembro',
          kind: 'expense',
          accountId: 'bank',
          categoryId: 'group',
          plan: 859,
        },
      },
    ],
    periods[1],
  );
  await seed(right, 'Banco das férias', 'Despesa exclusiva das férias');
  await page.goto('/');
  await space(page).selectOption(left.spaceId);
  await month(page).selectOption(periods[0]);
  await goToScreen(page, 'Plano e movimentos');
  await expect(page.getByTestId('line-monthly')).toContainText('apenas em novembro');
  const matchesNovember = (r: Request) => {
    const url = new URL(r.url());
    return (
      r.method() === 'GET' &&
      url.searchParams.get('spaceId') === left.spaceId &&
      url.searchParams.get('period') === periods[0]
    );
  };
  const lag = await holdFinanceResponse(page, matchesNovember);
  try {
    await lag.waitUntilHeld();
    await month(page).selectOption(periods[1]);
    await expect(page.getByTestId('line-december')).toBeVisible();
  } finally {
    await lag.release();
  }
  await expect(page.getByTestId('line-december')).toContainText('exclusiva de dezembro');
  await expect(page.getByTestId('line-monthly')).toHaveCount(0);
  await month(page).selectOption(periods[0]);
  await expect(page.getByTestId('line-monthly')).toBeVisible();
  const switchLag = await holdFinanceResponse(page, matchesNovember);
  try {
    await switchLag.waitUntilHeld();
    await space(page).selectOption(right.spaceId);
    await goToScreen(page, 'Plano e movimentos');
    await expect(page.getByTestId('line-monthly')).toContainText('exclusiva das férias');
  } finally {
    await switchLag.release();
  }
  await expect(space(page)).toHaveValue(right.spaceId);
  await expect(page.getByText('Despesa visível apenas em novembro')).toHaveCount(0);
  await expect(page.getByTestId('line-monthly')).toContainText('exclusiva das férias');
  await assertPrivateStorage(page, 'Banco de novembro', 'Despesa exclusiva das férias');
  await page.screenshot({ path: info.outputPath('troca-espaco.png'), animations: 'disabled' });
});

test('a troca de titular durante uma confirmação conserva o recibo só para quem a iniciou', async ({
  page,
  application,
  playwright,
}) => {
  const accountA = syntheticCredentials();
  const accountB = {
    ...syntheticCredentials(),
    email: 'bruno.qa@example.invalid',
    firstName: 'Bruno',
    lastName: 'Pessoa',
  };
  const other = await playwright.request.newContext();
  const api = page.context().request;
  try {
    await registerOwner(other, application, accountB);
    const owner = await registerOwner(api, application, accountA);
    const finance = await createTestSpace(api, application.url, owner, 'Finanças de Ana');
    const privateName = 'Movimento reservado a Ana';
    await seed(finance, 'Conta reservada a Ana', privateName);
    await page.goto('/');
    await goToScreen(page, 'Plano e movimentos');
    await page.getByTestId('line-monthly').getByRole('button', { name: 'Registar', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Montante (€)', { exact: true }).fill('12,43');
    await page.getByRole('dialog').getByLabel('Nome da compra (opcional)').fill('Compra pessoal de Ana');
    let sent = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/state') sent++;
    });
    const lag = await holdFinanceResponse(page, (r) => r.method() === 'POST');
    const sibling = await page.context().newPage();
    const login = async (tab: Page, who: typeof accountA) => {
      await tab.getByLabel('Email', { exact: true }).fill(who.email);
      await tab.getByLabel('Palavra-passe', { exact: true }).fill(who.password);
      await button(tab, 'Entrar').click();
    };
    try {
      await button(page, 'Confirmar registo').click();
      await lag.waitUntilHeld();
      const saved = await currentMonth(finance, periods[0]);
      expect(saved.events).toHaveLength(1);
      expect(saved.events[0]).toMatchObject({ amount: 1243 });
      await assertPrivateStorage(page, privateName, 'Compra pessoal de Ana');
      await sibling.goto('/');
      if (!(await button(sibling, 'Terminar sessão').isVisible()))
        await button(sibling, 'Definições do utilizador').click();
      await button(sibling, 'Terminar sessão').click();
      await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
      await login(sibling, accountB);
      await expect(page.getByRole('heading', { name: 'Sem espaços' })).toBeVisible();
    } finally {
      await lag.release();
    }
    await expect(page.getByRole('heading', { name: 'Sem espaços' })).toBeVisible();
    await expect(page.getByText(privateName)).toHaveCount(0);
    await assertPrivateStorage(page, privateName, 'Compra pessoal de Ana', accountA.email);
    if (!(await button(sibling, 'Terminar sessão').isVisible()))
      await button(sibling, 'Definições do utilizador').click();
    await button(sibling, 'Terminar sessão').click();
    await login(sibling, accountA);
    await expect(space(page)).toHaveValue(finance.spaceId);
    await expect(month(page)).toHaveValue(periods[0]);
    const saved = await currentMonth(finance, periods[0]);
    expect(saved.events.map((event: { amount: number }) => event.amount)).toEqual([1243]);
    expect(sent).toBe(1);
    await sibling.close();
  } finally {
    await other.dispose();
  }
});

test('rascunho financeiro em memória após expiração pertence à mesma pessoa e ao mesmo mês', async ({
  page,
  application,
  playwright,
}) => {
  const person = syntheticCredentials();
  const other = { ...syntheticCredentials(), email: 'bruno.qa@example.invalid', firstName: 'Bruno' };
  const api = page.context().request;
  const second = await playwright.request.newContext();
  try {
    await registerOwner(second, application, other);
    const id = await registerOwner(api, application, person);
    const finance = await createTestSpace(api, application.url, id, 'Orçamento de ensaio');
    await seed(finance, 'Banco de teste', 'Compras de ensaio');
    await page.goto('/');
    await goToScreen(page, 'Plano e movimentos');
    await page.getByTestId('line-monthly').getByRole('button', { name: 'Registar' }).click();
    const dialog = page.getByRole('dialog');
    const amount = dialog.getByLabel('Montante (€)', { exact: true });
    const description = dialog.getByLabel('Nome da compra (opcional)');
    const draft = 'Rascunho pessoal em memória';
    await amount.fill('7,89');
    await description.fill(draft);
    async function expire() {
      const db = new DatabaseSync(application.database, { timeout: 3000 });
      try {
        db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(id);
      } finally {
        db.close();
      }
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
      await expect(dialog).toHaveCount(0);
      await assertPrivateStorage(page, draft);
    }
    async function login(credentials: typeof person) {
      await page.getByLabel('Email', { exact: true }).fill(credentials.email);
      await page.getByLabel('Palavra-passe', { exact: true }).fill(credentials.password);
      await button(page, 'Entrar').click();
    }
    await expire();
    await login(person);
    await expect(space(page)).toHaveValue(finance.spaceId);
    await expect(month(page)).toHaveValue(periods[0]);
    await expect(amount).toHaveValue('7,89');
    await expect(description).toHaveValue(draft);
    expect((await currentMonth(finance, periods[0])).events).toEqual([]);
    await expire();
    await login(other);
    await expect(page.getByRole('heading', { name: 'Sem espaços' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await assertPrivateStorage(page, draft);
    if (!(await button(page, 'Terminar sessão').isVisible()))
      await button(page, 'Definições do utilizador').click();
    await button(page, 'Terminar sessão').click();
    await login(person);
    await expect(month(page)).toHaveValue(periods[0]);
    await expect(dialog).toHaveCount(0);
  } finally {
    await second.dispose();
  }
});
