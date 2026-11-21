import { randomUUID } from 'node:crypto';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import type { Action } from '../../src/modules/finance/domain/actions';
import type { Command, Confirmed } from '../../src/modules/finance/contracts/command';
import { examples } from '../fixtures';
import { type Application, expect, syntheticCredentials, test as base } from './identity-application';

type Credentials = ReturnType<typeof syntheticCredentials>;

export async function registerOwner(api: APIRequestContext, app: Application, credentials: Credentials) {
  const identity = (data: Record<string, unknown>) =>
    api.post(app.url + '/api/identity', {
      headers: { Origin: app.url },
      data,
    });
  expect((await identity({ action: 'register', ...credentials })).ok()).toBe(true);
  const token = new URL(await app.emailLink(credentials.email, 'verify')).hash.slice(8);
  expect((await identity({ action: 'verify', token, password: credentials.password })).ok()).toBe(true);
  await loginOwner(api, app.url, credentials);
  const { account } = await (await api.get(app.url + '/api/identity')).json();
  expect(account.verified).toBe(true);
  return account.id as string;
}

async function loginOwner(api: APIRequestContext, origin: string, { email, password }: Credentials) {
  const login = await api.post(origin + '/api/identity', {
    headers: { Origin: origin },
    data: { action: 'login', email, password },
  });
  expect(login.ok()).toBe(true);
}

export class FinanceApi {
  constructor(
    readonly api: APIRequestContext,
    readonly origin: string,
    readonly accountId: string,
    readonly spaceId: string,
  ) {}

  private scoped(path: string, period?: string) {
    const url = new URL(path, this.origin);
    url.searchParams.set('spaceId', this.spaceId);
    if (period) url.searchParams.set('period', period);
    return url.href;
  }

  get headers() {
    return { 'X-Account': this.accountId, Origin: this.origin };
  }

  read(period?: string) {
    return this.api.get(this.scoped('/api/state', period), { headers: this.headers });
  }

  reference(operation: 'prepare' | 'resolve' | 'ack', requestId: string, period: string) {
    return this.api.post(this.scoped('/api/requests'), {
      headers: this.headers,
      data: { operation, requestId, period },
    });
  }

  async command(command: Command) {
    const response = await this.api.post(this.scoped('/api/state'), { headers: this.headers, data: command });
    if (response.ok()) {
      const acknowledged = await this.reference('ack', command.requestId, command.period);
      expect(acknowledged.ok(), await acknowledged.text()).toBe(true);
    }
    return response;
  }

  async setup(actions: Action[], period: string) {
    const first = await this.read();
    expect(first.ok(), await first.text()).toBe(true);
    let state: Confirmed = await first.json();
    for (const action of actions) {
      const response = await this.command({
        period: action.type === 'month' ? state.state.selected || action.period : period,
        revision: state.revision,
        action,
        requestId: randomUUID(),
      });
      expect(response.ok(), await response.text()).toBe(true);
      state = await response.json();
    }
    return state;
  }
}

export async function createTestSpace(api: APIRequestContext, origin: string, userId: string, name: string) {
  const response = await api.post(origin + '/api/spaces', {
    headers: { Origin: origin, 'X-Account': userId },
    data: { name, requestId: randomUUID() },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { space } = await response.json();
  expect(space.currency).toBe('EUR');
  return new FinanceApi(api, origin, userId, space.id);
}

export const test = base.extend<{
  credentials: Credentials;
  finance: FinanceApi;
  openExamples(page: Page): Promise<void>;
  loginSibling(context: BrowserContext): Promise<void>;
}>({
  credentials: async ({}, use) => {
    await use(syntheticCredentials());
  },
  finance: async ({ playwright, application, credentials }, use) => {
    const api = await playwright.request.newContext({ baseURL: application.url });
    try {
      const owner = await registerOwner(api, application, credentials);
      const finance = await createTestSpace(api, application.url, owner, 'Finanças de ensaio');
      const { accounts, categories } = examples();
      await finance.setup(
        [
          { type: 'month', period: '2026-10' },
          ...accounts.map((account) => ({ type: 'account', account }) as const),
          ...categories.map((category) => ({ type: 'category', category }) as const),
        ],
        '2026-10',
      );
      await use(finance);
    } finally {
      await api.dispose();
    }
  },
  storageState: async ({ finance }, use) => {
    await use(await finance.api.storageState());
  },
  loginSibling: async ({ application, credentials }, use) => {
    await use(async (context) => {
      // Playwright can carry the fixture's storageState into an explicitly created context.
      await context.clearCookies();
      await loginOwner(context.request, application.url, credentials);
    });
  },
  openExamples: async ({ finance }, use) => {
    await use(async (page) => {
      const s = examples();
      await finance.setup(
        [
          ...s.reserves.map((reserve) => ({ type: 'reserve', reserve }) as const),
          ...s.base.map((line) => ({ type: 'line', target: 'base', line }) as const),
          ...s.recurring.map((definition) => ({ type: 'recurring', definition }) as const),
          { type: 'month', period: s.selected },
        ],
        '2026-10',
      );
      const initials: Action[] = [];
      for (const [source, amount] of Object.entries(s.months[s.selected].initials)) {
        if (amount !== null) initials.push({ type: 'initial', source, amount });
      }
      await finance.setup(initials, s.selected);
      await page.goto('/');
      await page.locator('.app-shell[data-ready="true"]').waitFor();
      await expect(page.getByLabel('Mês selecionado')).toHaveValue(s.selected);
    });
  },
});

export { expect };
