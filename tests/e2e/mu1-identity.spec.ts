import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { APIRequestContext } from '@playwright/test';
import { expect, syntheticCredentials, test } from './identity-application';

function command(api: APIRequestContext, url: string, action: string, body: Record<string, unknown> = {}) {
  return api.post(url + '/api/identity', { headers: { Origin: url }, data: { action, ...body } });
}

test('anónimo, sessão limitada e conta confirmada conservam as finanças e os ficheiros fechados', async ({
  page,
  application,
}) => {
  const { url, database } = application;
  const api = page.context().request;
  const account = syntheticCredentials();
  async function blocked() {
    const responses = await Promise.all([
      api.get(url + '/api/state?period=2026-11'),
      api.post(url + '/api/state', { headers: { Origin: url }, data: { period: '2026-11' } }),
      ...['backup', 'export'].map((action) =>
        api.post(url + '/api/local-files?action=' + action, { headers: { Origin: url } }),
      ),
    ]);
    for (const response of responses) {
      expect([401, 403]).toContain(response.status());
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(await response.text()).not.toMatch(/"accounts"|"months"|"events"|\.sqlite|o-meu-mes-export/i);
    }
    expect(existsSync(join(dirname(database), 'backups'))).toBe(false);
  }
  await blocked();
  expect((await command(api, url, 'register', account)).ok()).toBe(true);
  expect((await command(api, url, 'login', { email: account.email, password: account.password })).ok()).toBe(
    true,
  );
  const read = async () => (await (await api.get(url + '/api/identity')).json()).account;
  const pending = await read();
  expect(pending).toMatchObject({ verified: false, email: account.email });
  await blocked();
  const link = await application.emailLink(account.email, 'verify');
  const token = new URL(link).hash.slice('#verify='.length);
  await page.goto(link);
  expect((await read()).verified).toBe(false);
  const attempts = await Promise.all(
    [1, 2].map(() => command(api, url, 'verify', { token, password: account.password })),
  );
  expect(attempts.filter((r) => r.ok())).toHaveLength(1);
  expect(await read()).toBeNull();
  expect((await command(api, url, 'login', { email: account.email, password: account.password })).ok()).toBe(
    true,
  );
  expect(await read()).toMatchObject({ id: pending.id, verified: true });
  await blocked();
  expect((await command(api, url, 'logout')).ok()).toBe(true);
  expect(await read()).toBeNull();
});

test('duas abas partilham a revogação e leituras de fundo não prolongam a sessão', async ({
  browser,
  page,
  application,
}) => {
  const { url, database } = application;
  const api = page.context().request;
  const account = syntheticCredentials();
  expect((await command(api, url, 'register', account)).ok()).toBe(true);
  const link = await application.emailLink(account.email, 'verify');
  expect(
    (
      await command(api, url, 'verify', { token: new URL(link).hash.slice(8), password: account.password })
    ).ok(),
  ).toBe(true);
  const factors = { email: account.email, password: account.password };
  expect((await command(api, url, 'login', factors)).ok()).toBe(true);
  const sibling = await page.context().newPage();
  const other = await browser.newContext();
  try {
    expect((await command(other.request, url, 'login', { ...factors, remember: true })).ok()).toBe(true);
    const sessions = () => new DatabaseSync(database, { readOnly: true });
    function timings() {
      const db = sessions();
      try {
        return db
          .prepare(
            'SELECT remembered, active, expires - created AS lifetime FROM sessions ORDER BY remembered',
          )
          .all();
      } finally {
        db.close();
      }
    }
    const before = timings();
    expect(before.map((row) => [row.remembered, row.lifetime])).toEqual([
      [0, 12 * 3600000],
      [1, 30 * 86400000],
    ]);
    for (const tab of [page, sibling]) {
      await tab.goto(url);
      await tab.evaluate(async () => {
        await fetch('/api/identity');
      });
    }
    expect(timings()).toEqual(before);
    const db = new DatabaseSync(database, { timeout: 3000 });
    try {
      db.prepare('UPDATE sessions SET active=? WHERE remembered=0').run(Date.now() - 31 * 60000);
    } finally {
      db.close();
    }
    for (const tab of [page, sibling]) {
      const state = await tab.evaluate(async () => (await fetch('/api/identity')).json());
      expect(state.account).toBeNull();
    }
    expect((await (await other.request.get(url + '/api/identity')).json()).account.id).toBeTruthy();
    const persistentCookies = await other.cookies(url);
    expect(
      persistentCookies.some((cookie) => cookie.httpOnly && cookie.expires > Date.now() / 1000 + 28 * 86400),
    ).toBe(true);
    expect((await command(api, url, 'login', factors)).ok()).toBe(true);
    expect((await command(other.request, url, 'revokeAll')).ok()).toBe(true);
    for (const ctx of [page.context(), other]) {
      expect((await (await ctx.request.get(url + '/api/identity')).json()).account).toBeNull();
    }
  } finally {
    await sibling.close();
    await other.close();
  }
});

test('respostas públicas genéricas, origem obrigatória e token expirado', async ({ page, application }) => {
  const { url, database } = application;
  const api = page.context().request;
  const account = syntheticCredentials();
  const otherOrigin = await api.post(url + '/api/identity', {
    headers: { Origin: 'https://outra.example.invalid' },
    data: { action: 'register', ...account },
  });
  expect(otherOrigin.status()).toBe(403);
  const register = () => command(api, url, 'register', account);
  const first = await register();
  const duplicate = await register();
  expect(first.ok()).toBe(true);
  expect(duplicate.status()).toBe(first.status());
  expect(await duplicate.json()).toEqual(await first.json());
  const [known, unknown] = await Promise.all(
    [account.email, 'outra@example.invalid'].map((email) => command(api, url, 'forgot', { email })),
  );
  expect(known.status()).toBe(unknown.status());
  expect(await known.json()).toEqual(await unknown.json());
  const token = new URL(await application.emailLink(account.email, 'verify')).hash.slice(8);
  const db = new DatabaseSync(database, { timeout: 3000 });
  try {
    expect(db.prepare('SELECT count(*) AS n FROM users').get()?.n).toBe(1);
    db.prepare("UPDATE challenges SET expires=? WHERE kind='verify'").run(Date.now() - 1000);
  } finally {
    db.close();
  }
  expect((await command(api, url, 'verify', { password: account.password, token })).ok()).toBe(false);
  expect((await command(api, url, 'login', { email: account.email, password: account.password })).ok()).toBe(
    true,
  );
  expect((await command(api, url, 'resend')).status()).toBe(429);
  const identity = await api.get(url + '/api/identity');
  expect(identity.ok(), await identity.text()).toBe(true);
  expect((await identity.json()).account?.verified).toBe(false);
});
