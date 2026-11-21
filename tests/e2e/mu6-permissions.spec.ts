import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createTestSpace, registerOwner } from './application';
import { expect, syntheticCredentials, test } from './identity-application';

test.use({ rightsTest: true });
test('MU6 permissões das rotas nos sete contextos e ausência de efeitos financeiros', async ({
  application,
  playwright,
  request: ownerSession,
}) => {
  const { url, operator } = application;
  const owner = await registerOwner(ownerSession, application, syntheticCredentials());
  const finance = await createTestSpace(ownerSession, url, owner, 'Espaço da matriz');
  const period = '2028-01';
  const initial = await finance.setup([{ type: 'month', period }], period);
  const scope = '?spaceId=' + finance.spaceId;
  const other = await playwright.request.newContext({ baseURL: url });
  const db = new DatabaseSync(application.database, { timeout: 5000 });
  let account = '';
  const headers = () => ({ Origin: url, 'X-Account': account });
  const identity = (data: object) => other.post('/api/identity', { headers: { Origin: url }, data });
  async function verify(confirmed: boolean, reader = false, handler = false) {
    const personal = confirmed ? 200 : 403;
    const read = reader ? 200 : 403;
    const routes: [string, number, object?][] = [
      ['/api/spaces', personal],
      ['/api/closure', personal],
      ['/api/privacy', personal],
      ['/api/state' + scope, read],
      ['/api/history' + scope + '&period=' + period + '&eventId=amostra', read],
      ['/api/sharing' + scope, read],
      ['/api/requests' + scope, 403],
      ['/api/export' + scope, 403, { action: 'prepare' }],
      ['/api/local-files', 403, { action: 'backup' }],
      ['/api/requests' + scope, 403, { operation: 'prepare', requestId: 'amostra', period }],
      ['/api/sharing' + scope, 403, { action: 'issue', email: 'convite@example.invalid', role: 'reader' }],
      [
        '/api/state' + scope,
        403,
        {
          period,
          revision: initial.revision,
          requestId: randomUUID(),
          action: { type: 'month', period: '2028-02' },
        },
      ],
    ];
    for (const [route, status, data] of routes) {
      const result = data
        ? await other.post(route, { headers: headers(), data })
        : await other.get(route, { headers: headers() });
      expect(result.status(), route).toBe(status);
      expect(result.headers()['cache-control'], route).toContain('no-store');
      if (route === '/api/privacy' && confirmed) expect((await result.json()).operator).toBe(handler);
      if (status === 403) expect(await result.text()).not.toContain('Espaço da matriz');
    }
    expect((await (await finance.read()).json()).revision).toBe(initial.revision);
  }
  try {
    await verify(false);
    const guest = { ...syntheticCredentials(), email: 'leitor.qa@example.invalid' };
    expect((await identity({ action: 'register', ...guest })).ok()).toBe(true);
    const login = () => identity({ action: 'login', email: guest.email, password: guest.password });
    expect((await login()).ok()).toBe(true);
    account = (await (await other.get('/api/identity')).json()).account.id;
    await verify(false);
    const token = new URL(await application.emailLink(guest.email, 'verify')).hash.slice(8);
    expect((await identity({ action: 'verify', token, password: guest.password })).ok()).toBe(true);
    expect((await login()).ok()).toBe(true);
    await createTestSpace(other, url, account, 'Espaço próprio');
    await verify(true);
    const sharing = (data: object) =>
      ownerSession.post(url + '/api/sharing' + scope, { headers: finance.headers, data });
    const invite = await sharing({ action: 'issue', email: guest.email, role: 'reader' });
    expect(invite.ok()).toBe(true);
    const accepted = await other.post('/api/sharing', {
      headers: headers(),
      data: { action: 'acceptInvite', code: (await invite.json()).code },
    });
    expect(accepted.ok()).toBe(true);
    await verify(true, true);
    expect((await sharing({ action: 'remove', memberId: account })).ok()).toBe(true);
    await verify(true);
    db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(account);
    await verify(false);
    expect(
      (
        await identity({
          action: 'login',
          email: operator!.email,
          password: operator!.password,
          otp: operator!.otp(),
        })
      ).ok(),
    ).toBe(true);
    account = operator!.id;
    await verify(true, false, true);
    expect((await (await finance.read()).json()).periods).toEqual([period]);
  } finally {
    db.close();
    await other.dispose();
  }
});
