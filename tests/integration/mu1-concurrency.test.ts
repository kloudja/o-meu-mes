import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { settings } from '../../src/modules/identity/policy.mjs';
import { dispatchOne } from '../../src/modules/identity/mail.mjs';
import { connect } from '../../src/server/storage.mjs';
import { migrate } from '../../src/server/storage.mjs';

async function instance(path: string, key: string) {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done) => probe.close(() => done()));
  const url = 'http://127.0.0.1:' + port;
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      env: {
        ...process.env,
        OMEUMES_AUTH_ORIGIN: url,
        OMEUMES_AUTH_KEY: key,
        OMEUMES_DB_PATH: path,
        OMEUMES_TEST_MODE: '1',
        OMEUMES_MAIL_TRANSPORT: 'test',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => resolve());
  });
  const stop = async () => {
    child.kill();
    await closed;
  };
  for (let i = 0; i < 100 && child.exitCode === null; i++) {
    if ((await fetch(url + '/api/identity', { signal: AbortSignal.timeout(500) }).catch(() => null))?.ok)
      return {
        stop,
        post: (data: object, cookie = '') =>
          fetch(url + '/api/identity', {
            method: 'POST',
            headers: { Origin: url, Cookie: cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
      };
    await new Promise((done) => setTimeout(done, 100));
  }
  await stop();
  throw new Error('Arranque da instância sintética indisponível.');
}

it('dois processos confirmam o registo uma única vez e resolvem a disputa pelo mesmo endereço', async () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'omeumes-test-mu1-race-'));
  const path = join(root, 'identity.sqlite'),
    key = randomBytes(32).toString('base64');
  migrate(path, undefined, true);
  const db = connect(path);
  const config = settings({ OMEUMES_AUTH_KEY: key });
  const servers: Awaited<ReturnType<typeof instance>>[] = [];
  const emails = ['ana@example.invalid', 'rui@example.invalid'];
  const password = 'Quatro barcos sobre o rio 2026';
  const register = (email: string) => ({
    action: 'register',
    firstName: 'Nome',
    lastName: 'Sintético',
    email,
    password,
    country: 'PT',
    terms: 'dev-2',
    adult: true,
  });
  async function messages(kind: string) {
    const tokens = new Map<string, string>();
    while (
      await dispatchOne(path, config, async (job, _config, message) => {
        if (job.kind === kind)
          tokens.set(
            job.user_id,
            new URLSearchParams(new URL(message.text.match(/http[^\s]+/)![0]).hash.slice(1)).values().next()
              .value!,
          );
        return { status: 'delivered' };
      })
    ) {}
    return tokens;
  }
  try {
    servers.push(await instance(path, key));
    servers.push(await instance(path, key));
    const same = await Promise.all(
      servers.map((s, i) => s.post(register(i ? emails[0].toUpperCase() : emails[0]))),
    );
    expect(same.map((r) => r.status)).toEqual([200, 200]);
    expect(db.prepare('SELECT count(*) AS n FROM users').get()?.n).toBe(1);
    expect((await servers[1].post(register(emails[1]))).status).toBe(200);
    const links = await messages('verify');
    const names = emails.map((email) =>
      String(db.prepare('SELECT id FROM users WHERE email=?').get(email)?.id),
    );
    const verify = (id: string) => ({ action: 'verify', password, token: links.get(id) });
    const once = await Promise.all(servers.map((s) => s.post(verify(names[0]))));
    expect(once.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await servers[1].post(verify(names[1]))).ok).toBe(true);
    const sessions = await Promise.all(
      servers.map((s, i) => s.post({ action: 'login', email: emails[i], password })),
    );
    const cookies = sessions.map((r) => r.headers.getSetCookie()[0].split(';')[0]);
    const target = 'unico@example.invalid';
    const pending = await Promise.all(
      servers.map((s, i) => s.post({ action: 'email', password, newEmail: target }, cookies[i])),
    );
    expect(pending.every((r) => r.ok)).toBe(true);
    const emailLinks = await messages('email');
    const confirmation = await Promise.all(
      servers.map((s, i) => s.post({ action: 'confirmEmail', token: emailLinks.get(names[i]) })),
    );
    expect(confirmation.map((r) => r.status).sort()).toEqual([200, 403]);
    const winner = confirmation.findIndex((r) => r.ok);
    expect(db.prepare('SELECT id FROM users WHERE email=?').get(target)?.id).toBe(names[winner]);
    expect(db.prepare('SELECT email FROM users WHERE id=?').get(names[1 - winner])?.email).toBe(
      emails[1 - winner],
    );
    expect(db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(names[winner])?.n).toBe(0);
  } finally {
    await Promise.all(servers.map((s) => s.stop()));
    db.close();
    if (dirname(root) === realpathSync(tmpdir()) && basename(root).startsWith('omeumes-test-mu1-race-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
