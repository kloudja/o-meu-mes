import { randomBytes } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { TOTP } from 'otpauth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connect, migrate } from '../../src/server/storage.mjs';
import { executeIdentity, readIdentity } from '../../src/modules/identity/account';
import { identityInput } from '../../src/modules/identity/input';
import { policy, settings } from '../../src/modules/identity/policy.mjs';
import { deliver, dispatchOne, maintenance } from '../../src/modules/identity/mail.mjs';
import { createBackup, restoreBackup } from '../../src/server/local-files.mjs';

const password = 'Quatro barcos sobre o rio 2026';
const email = 'ana+teste@example.invalid';
const register = {
  action: 'register',
  firstName: 'Ana Maria',
  lastName: 'Silva Reis',
  country: 'PT',
  adult: true,
  terms: 'dev-2',
  email,
  password,
};
const connections: ReturnType<typeof connect>[] = [];
const fixtureDirectories: string[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
  vi.unstubAllGlobals();
  for (const directory of fixtureDirectories.splice(0)) {
    const target = realpathSync(directory);
    if (
      dirname(target) !== realpathSync(tmpdir()) ||
      !basename(target).startsWith('omeumes-test-mu1-rules-')
    ) {
      throw new Error('Diretório de fixture inesperado.');
    }
    rmSync(target, { recursive: true, force: true, maxRetries: 5 });
  }
});
function fixture() {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'omeumes-test-mu1-rules-'));
  fixtureDirectories.push(directory);
  const path = join(directory, 'identity.sqlite');
  migrate(path, undefined, true);
  const db = connect(path);
  connections.push(db);
  const state = { now: 1_800_000_000_000, cookie: '' };
  const config = settings({ OMEUMES_AUTH_KEY: randomBytes(32).toString('base64') });
  const command = (input: unknown, cookie = state.cookie, expected: string | null = null) => {
    const result = executeIdentity(db, config, identityInput.parse(input), cookie, state.now, expected);
    if (result.cookie !== undefined) state.cookie = result.cookie;
    return result;
  };
  const read = (cookie = state.cookie) => readIdentity(db, cookie, state.now);
  async function link(kind: string) {
    let token = '';
    for (let i = 0; i < 8 && !token; i++) {
      const ran = await dispatchOne(
        path,
        config,
        async (job, _cfg, message) => {
          if (job.kind === kind)
            token =
              new URLSearchParams(new URL(message.text.match(/http[^\s]+/)![0]).hash.slice(1)).values().next()
                .value ?? '';
          return { status: 'delivered' };
        },
        state.now,
      );
      if (!ran) break;
    }
    if (!token) throw new Error('Falta a comunicação sintética.');
    return token;
  }
  async function verified() {
    command({ ...register, email: '  ANA+TESTE@Example.Invalid  ' });
    command({ action: 'verify', token: await link('verify'), password });
    command({ action: 'login', email, password });
    return read().account!;
  }
  const nextOtp = (secret: string) => {
    state.now += 30_000;
    return new TOTP({ secret }).generate({ timestamp: state.now });
  };
  return { db, path, config, state, command, read, link, verified, nextOtp };
}
describe('Identidade, fatores e sessões', () => {
  it('valida versão, país, declaração, frase-passe, normalização e intenção sem conceder permissões', async () => {
    const f = fixture();
    for (const change of [
      { terms: 'dev-0' },
      { country: 'XX' },
      { adult: false },
      { password: 'curta' },
      { password: '1'.repeat(15) },
      { role: 'owner' },
    ])
      expect(identityInput.safeParse({ ...register, ...change }).success).toBe(false);
    expect(() => f.command({ ...register, invite: 'convite-sintético' })).toThrow('O convite');
    f.command({ ...register, email: email.toUpperCase() });
    expect(f.db.prepare('SELECT count(*) AS n FROM users').get()?.n).toBe(1);
    expect(f.db.prepare('SELECT version,country,locale FROM acceptances').get()).toMatchObject({
      version: 'dev-2',
      country: 'PT',
      locale: 'pt-PT',
    });
    expect(f.db.prepare('SELECT digest FROM registration_intents').get()).toBeUndefined();
    expect(
      String(f.db.prepare('SELECT password_hash FROM credentials').get()?.password_hash).startsWith(
        '$argon2id$v=19$m=19456,t=2,p=1$',
      ),
    ).toBe(true);
    const token = await f.link('verify');
    expect(() => f.command({ action: 'verify', token, password: 'outra palavra-passe' })).toThrow();
    f.command({ action: 'login', email, password });
    const old = f.state.cookie;
    expect(f.read().account?.scope).toBe('pending');
    expect(() => f.command({ action: 'codes', password })).toThrow();
    f.command({ action: 'verify', token, password });
    expect(f.read(old).account).toBeNull();
    expect(() => f.command({ action: 'verify', token, password })).toThrow();
  });
  it('substitui o autenticador mediante dois fatores, rejeita replay e conserva MFA depois de reset por email', async () => {
    const f = fixture();
    await f.verified();
    const secret = f.command({ action: 'enroll', password }).secret!;
    expect(f.read().account?.mfa).toBe(false);
    const otp = f.nextOtp(secret);
    const codes = f.command({ action: 'activate', otp }).codes!;
    expect(codes).toHaveLength(8);
    expect(() => f.command({ action: 'disable', password, otp })).toThrow();
    expect(() => f.command({ action: 'login', email, password })).toThrow();
    const old = f.state.cookie;
    f.command({ action: 'recoverMfa', email, password, code: codes[0] });
    expect(f.read().account?.scope).toBe('replace');
    expect(f.read(old).account).toBeNull();
    expect(() => f.command({ action: 'recoverMfa', email, password, code: codes[0] })).toThrow();
    expect(() => f.command({ action: 'codes', password })).toThrow();
    expect(() => f.command({ action: 'email', password, newEmail: 'x@example.invalid' })).toThrow();
    const replacement = f.command({ action: 'enroll' }).secret!;
    f.command({ action: 'activate', otp: f.nextOtp(replacement) });
    expect(() => f.command({ action: 'recoverMfa', email, password, code: codes[1] })).toThrow();
    f.command({ action: 'forgot', email });
    const token = await f.link('reset'),
      newPassword = password + ' novo';
    f.command({ action: 'reset', token, newPassword });
    expect(f.read().account).toBeNull();
    expect(() => f.command({ action: 'reset', token, newPassword })).toThrow();
    expect(() => f.command({ action: 'login', email, password: newPassword })).toThrow();
    const fresh = f.nextOtp(replacement);
    f.command({ action: 'login', email, password: newPassword, otp: fresh });
    expect(() => f.command({ action: 'disable', password: newPassword, otp: fresh })).toThrow();
    expect(f.read().account?.mfa).toBe(true);
    f.command({ action: 'disable', password: newPassword, otp: f.nextOtp(replacement) });
    expect(f.read().account?.mfa).toBe(false);
  });
  it('recuperação sem email pode corrigir o destino, invalida desafios velhos e consome o código na conclusão', async () => {
    const f = fixture();
    const id = (await f.verified()).id;
    const codes = f.command({ action: 'codes', password }).codes!;
    const original = f.state.cookie;
    const recovery = { action: 'recoverEmail', email, code: codes[0] };
    f.command({ ...recovery, newEmail: 'engano@example.invalid' });
    const first = await f.link('recoverEmail');
    expect(f.read(original).account).toBeNull();
    const newEmail = 'novo@example.invalid';
    f.command({ ...recovery, newEmail });
    const second = await f.link('recoverEmail');
    expect(() => f.command({ action: 'confirmEmail', token: first, newPassword: password })).toThrow();
    expect(() => f.command({ action: 'confirmEmail', token: second })).toThrow();
    f.command({ action: 'confirmEmail', token: second, newPassword: password + ' nova' });
    expect(() =>
      f.command({ action: 'recoverEmail', email: newEmail, newEmail: email, code: codes[0] }),
    ).toThrow();
    expect(() => f.command({ action: 'login', email, password })).toThrow();
    f.command({ action: 'login', email: newEmail, password: password + ' nova' });
    expect(f.read().account?.id).toBe(id);
  });
  it('mantém o email até à conclusão e invalida resets, sessões e intenção do endereço antigo', async () => {
    const f = fixture();
    const user = await f.verified();
    const previous = f.state.cookie;
    f.command({ action: 'forgot', email });
    const reset = await f.link('reset');
    f.command({ action: 'email', password, newEmail: 'novo@example.invalid' });
    expect(f.read().account?.email).toBe(email);
    const token = await f.link('email');
    f.command({ action: 'confirmEmail', token });
    expect(f.read(previous).account).toBeNull();
    expect(() => f.command({ action: 'reset', token: reset, newPassword: password })).toThrow();
    f.command({ action: 'login', email: 'novo@example.invalid', password });
    expect(f.read().account?.id).toBe(user.id);
  });
  it.each([false, true])('impõe os dois prazos por relógio do servidor (manter=%s)', async (remember) => {
    const f = fixture();
    await f.verified();
    f.command({ action: 'login', email, password, remember });
    const start = f.state.now;
    const idle = remember ? policy.rememberedIdle : policy.idle,
      absolute = remember ? policy.rememberedAbsolute : policy.absolute;
    f.state.now = start + idle - 1;
    expect(f.read().account).toBeTruthy();
    f.state.now++;
    expect(f.read().account).toBeNull();
    f.command({ action: 'login', email, password, remember });
    const again = f.state.now;
    for (f.state.now += idle - 1; f.state.now < again + absolute; f.state.now += idle - 1)
      f.command({ action: 'activity' });
    f.state.now = again + absolute;
    expect(f.read().account).toBeNull();
  });
  it('roda o cookie na reautenticação, mantém limite absoluto e impede ações de um separador com identidade antiga', async () => {
    const f = fixture();
    await f.verified();
    const old = f.state.cookie;
    const expires = f.db.prepare('SELECT expires FROM sessions').get()?.expires;
    f.state.now += policy.recent + 1;
    expect(() => f.command({ action: 'revokeAll' })).toThrow(/identidade/);
    f.command({ action: 'reauth', password });
    expect(f.read(old).account).toBeNull();
    expect(f.db.prepare('SELECT expires FROM sessions').get()?.expires).toBe(expires);
    expect(() => f.command({ action: 'revokeAll' }, f.state.cookie, 'other-guid')).toThrow();
    expect(f.read().account).toBeTruthy();
    const first = f.state.cookie;
    f.command({ action: 'login', email, password }, '');
    const other = f.read().sessions.find((s) => !s.current)!;
    f.command({ action: 'revoke', sessionId: other.id });
    expect(f.read(first).account).toBeNull();
    f.command({ action: 'password', password, newPassword: password + ' alterada' });
    expect(() => f.command({ action: 'login', email, password })).toThrow();
    f.command({ action: 'logout' });
    expect(f.read().account).toBeNull();
  });
  it('aplica limites mesmo quando os fatores falham', () => {
    const f = fixture();
    for (let i = 0; i < policy.attempts; i++)
      expect(() => f.command({ action: 'login', email, password })).toThrow(/autenticação/);
    expect(() => f.command({ action: 'login', email, password })).toThrow(/Demasiadas/);
    f.state.now += policy.attemptWindow;
    expect(() => f.command({ action: 'login', email, password })).toThrow(/autenticação/);
  });
  it('backup e restauro conservam GUID e mantêm a identidade em quarentena', async () => {
    const f = fixture();
    const user = await f.verified();
    const backup = await createBackup(f.path);
    const path = join(dirname(f.path), 'restored.sqlite');
    await restoreBackup(backup.path, path, f.path);
    migrate(path);
    const db = connect(path);
    connections.push(db);
    expect(db.prepare('SELECT id FROM users').get()?.id).toBe(user.id);
    expect(() => readIdentity(db, f.state.cookie, f.state.now)).toThrow(/reconciliação/);
    expect(f.read().account?.id).toBe(user.id);
  });
});

describe('Comunicações transacionais', () => {
  it('renova um token expirado durante a espera por quota, sem confirmar o endereço', async () => {
    const f = fixture();
    f.command(register);
    const old = f.db.prepare('SELECT digest FROM challenges').get()?.digest;
    f.db.prepare('INSERT INTO auth_limits VALUES(?,?,?)').run('daily-mail', f.state.now, policy.dailyMail);
    const offline = vi.fn(async () => ({ status: 'accepted', providerId: 'synthetic' }));
    await dispatchOne(f.path, f.config, offline, f.state.now);
    expect(offline).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT status FROM mail_jobs').get()?.status).toBe('deferred');
    f.state.now += policy.verify + 1;
    await dispatchOne(f.path, f.config, offline, f.state.now);
    expect(offline).toHaveBeenCalledTimes(1);
    expect(f.db.prepare('SELECT status,payload FROM mail_jobs').get()).toMatchObject({
      status: 'accepted',
      payload: null,
    });
    expect(f.db.prepare('SELECT digest FROM challenges').get()?.digest === old).toBe(false);
    expect(f.db.prepare('SELECT verified FROM users').get()?.verified).toBe(0);
  });
  it('limita timeouts, conserva conta e aceita reenvio depois do intervalo', async () => {
    const f = fixture();
    f.command(register);
    f.command({ action: 'login', email, password });
    expect(() => f.command({ action: 'resend' })).toThrow(/minuto/);
    for (let i = 0; i < policy.maxDeliveries; i++) {
      await dispatchOne(
        f.path,
        f.config,
        async () => {
          throw new Error('Timeout sintético');
        },
        f.state.now,
      );
      f.state.now += policy.retry * 2 ** i;
    }
    expect(f.db.prepare('SELECT status,attempts,payload FROM mail_jobs').get()).toMatchObject({
      status: 'failed',
      attempts: policy.maxDeliveries,
      payload: null,
    });
    f.command({ action: 'login', email, password });
    f.command({ action: 'resend' });
    f.command({ action: 'verify', password, token: await f.link('verify') });
    expect(f.db.prepare('SELECT count(*) AS n FROM users').get()?.n).toBe(1);
  });
  it('prioriza segurança, recupera a reserva e ignora confirmações tardias', async () => {
    const f = fixture();
    await f.verified();
    f.command({ ...register, email: 'outra@example.invalid' });
    f.command({ action: 'forgot', email });
    let release!: () => void;
    const parked = new Promise<void>((r) => {
      release = r;
    });
    const sending = dispatchOne(
      f.path,
      f.config,
      async (job) => {
        expect(job.kind).toBe('reset');
        await parked;
        return { status: 'deferred' };
      },
      f.state.now,
    );
    f.state.now += policy.lease;
    await dispatchOne(f.path, f.config, async () => ({ status: 'accepted' }), f.state.now);
    release();
    await sending;
    expect(f.db.prepare("SELECT status,attempts FROM mail_jobs WHERE kind='reset'").get()).toMatchObject({
      status: 'accepted',
      attempts: 2,
    });
    f.state.now += policy.unverifiedRetention + 1;
    maintenance(f.db, f.state.now);
    expect(f.db.prepare('SELECT count(*) AS n FROM users').get()?.n).toBe(1);
  });
  it('valida configuração e classifica as respostas Brevo sem efetuar ligações ao fornecedor', async () => {
    const f = fixture();
    expect(() => settings({})).toThrow();
    expect(() =>
      settings({
        OMEUMES_AUTH_KEY: f.config.key.toString('base64'),
        OMEUMES_AUTH_ORIGIN: 'http://example.invalid',
      }),
    ).toThrow();
    expect(() =>
      settings({
        OMEUMES_AUTH_KEY: f.config.key.toString('base64'),
        OMEUMES_TEST_MODE: '1',
        OMEUMES_MAIL_TRANSPORT: 'brevo',
      }),
    ).toThrow();
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    for (const [status, body, expected] of [
      [201, { messageId: 'synthetic' }, 'accepted'],
      [429, {}, 'deferred'],
      [503, {}, 'deferred'],
      [400, { code: 'duplicate_parameter' }, 'accepted'],
      [401, {}, 'failed'],
    ] as const) {
      mock.mockResolvedValueOnce(Response.json(body, { status }));
      const result = await deliver(
        { id: 'synthetic' },
        { ...f.config, transport: 'brevo' },
        { to: email, subject: 'Teste', text: 'Teste' },
        f.path,
      );
      expect(result.status).toBe(expected);
    }
  });
  it('só regista entrega perante o evento autenticado com o identificador exato', async () => {
    const f = fixture();
    f.command(register);
    const config = { ...f.config, transport: 'brevo' };
    const post = vi.fn(async () => ({ status: 'accepted', providerId: 'id-transacional' }));
    const reports = vi.fn();
    vi.stubGlobal('fetch', reports);
    await dispatchOne(f.path, config, post, f.state.now);
    for (const [id, expected] of [
      ['outro', 'accepted'],
      ['id-transacional', 'delivered'],
    ]) {
      f.state.now += policy.deliveryCheck;
      reports.mockResolvedValueOnce(Response.json({ events: [{ event: 'delivered', messageId: id }] }));
      await dispatchOne(f.path, config, post, f.state.now);
      expect(f.db.prepare('SELECT status FROM mail_jobs').get()?.status).toBe(expected);
    }
    expect(post).toHaveBeenCalledTimes(1);
    expect(reports).toHaveBeenCalledTimes(2);
    expect(f.db.prepare('SELECT verified FROM users').get()?.verified).toBe(0);
  });
});
