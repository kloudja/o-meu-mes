import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { hashSync, verifySync } from '@node-rs/argon2';
import { TOTP, Secret } from 'otpauth';
import { policy, type settings } from './policy.mjs';
import { opaque, digest, seal, unseal } from './secrets.mjs';
import type { Account, Feedback, IdentityView } from './contracts';
import type { Intent } from './input';
import { enqueue, recentlyQueued } from './mail.mjs';
import { IdentityError } from './error';
import { acceptInvite, proposeTransfer, registrationInvite } from '../spaces/sharing';

import { finishClosure, notifyMembers } from '../privacy/lifecycle.mjs';

export { IdentityError } from './error';

type Config = ReturnType<typeof settings>;
type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  pending_email: string | null;
  verified: number;
  lifecycle: 'Active' | 'PendingClosure' | 'Deleted';
  password_hash: string;
  totp: string | null;
  last_step: number;
  communication_locale: string;
  interface_locale: string;
  country: string;
};
type Session = {
  id: string;
  user_id: string;
  scope: Account['scope'];
  created: number;
  active: number;
  expires: number;
  authenticated: number;
  remembered: number;
  enrollment: string | null;
  enrollment_until: number | null;
};
type Challenge = {
  id: string;
  user_id: string;
  target: string;
  kind: 'verify' | 'reset' | 'email' | 'recoverEmail';
};
const userSql =
  'SELECT u.*,c.password_hash,c.totp,c.last_step FROM users u JOIN credentials c ON c.user_id=u.id ';
// Argon2id (library default, also asserted against the persisted PHC prefix in tests).
const encode = (value: string) =>
  hashSync(value, { memoryCost: policy.hashMemory, timeCost: policy.hashIterations, parallelism: 1 });
const dummyHash = encode(opaque());
const invalid = 'Os dados de autenticação não são válidos.';
const badLink = 'A ligação é inválida ou expirou. Pede uma nova ligação.';
function deny(message = invalid, status = 403, field?: string): never {
  throw new IdentityError(message, status, field);
}
function verifyPass(user: User | undefined, password: string) {
  const valid = verifySync(user?.password_hash ?? dummyHash, password);
  if (!valid || !user) deny();
}
function otpStep(secret: string, otp: string, now: number, last: number) {
  const totp = new TOTP({ secret, period: policy.otpPeriod, digits: 6, algorithm: 'SHA1' });
  const delta = totp.validate({ token: otp, timestamp: now, window: policy.otpWindow });
  const step = totp.counter({ timestamp: now }) + (delta ?? 0);
  if (delta === null || step <= last)
    deny('Código inválido ou já utilizado. Aguarda um novo código.', 403, 'otp');
  return step;
}
function verifyProof(
  db: DatabaseSync,
  config: Config,
  user: User,
  password: string,
  otp: string | undefined,
  now: number,
) {
  verifyPass(user, password);
  if (user.totp) {
    if (!otp) deny('Introduz o código atual do autenticador.', 403, 'otp');
    const step = otpStep(unseal(config.key, 'totp:' + user.id, user.totp), otp, now, user.last_step);
    db.prepare('UPDATE credentials SET last_step=? WHERE user_id=?').run(step, user.id);
  }
}
export function validSession(db: DatabaseSync, cookie: string, now: number) {
  if (!cookie) return;
  return db
    .prepare(
      'SELECT * FROM sessions WHERE digest=? AND expires>? AND active+CASE remembered WHEN 1 THEN ? ELSE ? END>?',
    )
    .get(digest(cookie), now, policy.rememberedIdle, policy.idle, now) as Session | undefined;
}
export function verifiedUser(
  db: DatabaseSync,
  cookie: string,
  expected: string | null,
  personalRights = false,
) {
  assertIdentityAvailable(db);
  const session = validSession(db, cookie, Date.now());
  if (
    session?.scope !== 'account' ||
    !db
      .prepare(
        "SELECT 1 FROM users WHERE id=? AND verified=1 AND (lifecycle='Active' OR (lifecycle='PendingClosure' AND ?=1))",
      )
      .get(session.user_id, Number(personalRights))
  )
    throw new IdentityError('É necessária uma sessão confirmada.', 403);
  if (!expected || session.user_id !== expected) throw new IdentityError('A conta ativa mudou.', 403);
  return session.user_id;
}
function loadUser(db: DatabaseSync, id: string) {
  return db.prepare(userSql + 'WHERE u.id=?').get(id) as User;
}
function byEmail(db: DatabaseSync, email: string) {
  return db.prepare(userSql + 'WHERE u.email=?').get(email) as User | undefined;
}
function sessionsOff(db: DatabaseSync, id: string) {
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
}
function invalidate(db: DatabaseSync, id: string) {
  sessionsOff(db, id);
  db.prepare('DELETE FROM challenges WHERE user_id=?').run(id);
  db.prepare('UPDATE users SET pending_email=NULL WHERE id=?').run(id);
}
function rotateCodes(db: DatabaseSync, id: string) {
  db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(id);
  const codes = Array.from({ length: policy.recoveryCodes }, () =>
    randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g)!.join('-'),
  );
  for (const code of codes) db.prepare('INSERT INTO recovery_codes VALUES(?,?)').run(digest(code), id);
  return codes;
}
function consumeCode(db: DatabaseSync, id: string, code: string) {
  if (!db.prepare('DELETE FROM recovery_codes WHERE user_id=? AND digest=?').run(id, digest(code)).changes)
    deny();
}
function createSession(
  db: DatabaseSync,
  id: string,
  scope: Account['scope'],
  remember: boolean,
  now: number,
) {
  const cookie = opaque();
  const lifetime =
    scope === 'replace' ? policy.recent : remember ? policy.rememberedAbsolute : policy.absolute;
  db.prepare(
    'INSERT INTO sessions(id,digest,user_id,scope,created,active,expires,remembered,authenticated) VALUES(?,?,?,?,?,?,?,?,?)',
  ).run(randomUUID(), digest(cookie), id, scope, now, now, now + lifetime, Number(remember), now);
  return { cookie, maxAge: remember ? lifetime / 1000 : undefined };
}
function lookupLink(db: DatabaseSync, token: string, now: number, kinds: string[]) {
  const link = db.prepare('SELECT * FROM challenges WHERE digest=? AND expires>?').get(digest(token), now) as
    | Challenge
    | undefined;
  if (!link || !kinds.includes(link.kind)) deny(badLink, 400);
  return link;
}
function limits(db: DatabaseSync, config: Config, subject: string, group: string, now: number) {
  const key = (value: string) => createHmac('sha256', config.key).update(value).digest('hex');
  const take = (id: string, max: number) => {
    const row = db
      .prepare(`INSERT INTO auth_limits VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET
      count=CASE WHEN started+?<=excluded.started THEN 1 ELSE count+1 END,
      started=CASE WHEN started+?<=excluded.started THEN excluded.started ELSE started END RETURNING count`)
      .get(key(id), now, policy.attemptWindow, policy.attemptWindow);
    return Number(row?.count) <= max;
  };
  // This closed loopback service shares one network budget. Never trust a forwarded IP header.
  const network = take('loopback', policy.networkAttempts);
  if (!network || !take(group + ':' + subject, policy.attempts))
    deny('Demasiadas tentativas. Tenta novamente mais tarde.', 429);
}
export function assertIdentityAvailable(db: DatabaseSync) {
  if (!db.prepare('SELECT 1 FROM identity_control WHERE id=1 AND restored=0').get())
    deny('O acesso a esta cópia aguarda reconciliação de segurança.', 503);
}
export function readIdentity(db: DatabaseSync, cookie: string, now: number): IdentityView {
  assertIdentityAvailable(db);
  const documents = db
    .prepare(
      "SELECT kind,version,country,locale,title,content FROM documents WHERE (kind='terms' AND version='dev-2') OR (kind='privacy' AND version='dev-3')",
    )
    .all() as unknown as IdentityView['documents'];
  const session = validSession(db, cookie, now);
  const view: IdentityView = { account: null, sessions: [], documents, refresh: policy.refresh };
  if (!session) return view;
  const user = loadUser(db, session.user_id);
  const delivery = db
    .prepare(
      "SELECT status FROM mail_jobs WHERE user_id=? AND kind IN('verify','email','recoverEmail') ORDER BY created DESC LIMIT 1",
    )
    .get(user.id);
  view.account = {
    id: user.id,
    country: user.country,
    interfaceLocale: user.interface_locale,
    communicationLocale: user.communication_locale,
    name: user.first_name + ' ' + user.last_name,
    email: user.email,
    pendingEmail: user.pending_email,
    verified: !!user.verified,
    mfa: !!user.totp,
    scope: user.lifecycle === 'PendingClosure' ? 'closure' : session.scope,
    hasCodes: !!db.prepare('SELECT 1 FROM recovery_codes WHERE user_id=? LIMIT 1').get(user.id),
    delivery: delivery ? String(delivery.status) : null,
    expiresAt: Math.min(
      session.expires,
      session.active + (session.remembered ? policy.rememberedIdle : policy.idle),
    ),
  };
  if (session.scope === 'account' && user.lifecycle !== 'PendingClosure')
    view.sessions = db
      .prepare(`SELECT id,created,active,remembered FROM sessions WHERE user_id=? AND expires>? AND
    active+CASE remembered WHEN 1 THEN ? ELSE ? END>? ORDER BY created DESC`)
      .all(user.id, now, policy.rememberedIdle, policy.idle, now)
      .map((s) => ({
        id: String(s.id),
        current: s.id === session.id,
        created: Number(s.created),
        active: Number(s.active),
        remembered: !!s.remembered,
      }));
  return view;
}
export interface Result extends Feedback {
  cookie?: string;
  maxAge?: number;
}
export function executeIdentity(
  db: DatabaseSync,
  config: Config,
  input: Intent,
  cookie: string,
  clock?: number,
  expectedAccount: string | null = null,
): Result {
  assertIdentityAvailable(db);
  const now = clock ?? Date.now();
  const session = validSession(db, cookie, now);
  if (!['activity', 'logout', 'revoke', 'revokeAll'].includes(input.action)) {
    const subject =
      'email' in input
        ? input.email
        : (session?.user_id ?? ('token' in input ? digest(input.token) : 'anonymous'));
    limits(db, config, subject, input.action, now);
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const now = clock ?? Date.now();
    assertIdentityAvailable(db);
    if (
      ['closeAccount', 'deleteSpace', 'cancelDeletion', 'cancelProposal', 'proposeTransfer'].includes(
        input.action,
      ) &&
      !expectedAccount
    )
      deny();
    if (expectedAccount && validSession(db, cookie, now)?.user_id !== expectedAccount)
      deny('A conta ativa mudou. Consulta a sessão antes de repetir.', 409);
    const result = apply(db, config, input, cookie, now);
    db.exec('COMMIT');
    return result;
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
  }
}

function apply(db: DatabaseSync, config: Config, input: Intent, cookie: string, now: number): Result {
  const session = validSession(db, cookie, now);
  const user = session ? loadUser(db, session.user_id) : undefined;
  const clear = { cookie: '', maxAge: 0 };
  const signOut = () => db.prepare('DELETE FROM sessions WHERE digest=?').run(digest(cookie));
  switch (input.action) {
    case 'register': {
      const invitation = input.invite ? registrationInvite(db, config, input.email, input.invite, now) : null;
      const hash = encode(input.password);
      if (!byEmail(db, input.email)) {
        const id = randomUUID();
        db.prepare(
          'INSERT INTO users(id,first_name,last_name,email,country,adult_at,created) VALUES(?,?,?,?,?,?,?)',
        ).run(id, input.firstName, input.lastName, input.email, input.country, now, now);
        db.prepare('INSERT INTO credentials(user_id,password_hash) VALUES(?,?)').run(id, hash);
        db.prepare("INSERT INTO acceptances VALUES(?,'terms',?,'PT','pt-PT',?)").run(id, input.terms, now);
        if (invitation)
          db.prepare('INSERT INTO registration_intents VALUES(?,?,?)').run(
            id,
            invitation.digest,
            now + policy.unverifiedRetention,
          );
        enqueue(db, config, loadUser(db, id), 'verify', input.email, now);
      }
      return {
        message:
          'Se o registo for novo, receberás uma ligação de confirmação. Podes entrar para consultar o estado.',
      };
    }
    case 'login': {
      const account = byEmail(db, input.email);
      if (!account) {
        verifyPass(undefined, input.password);
        deny();
      }
      verifyProof(db, config, account, input.password, input.otp, now);
      signOut();
      return createSession(
        db,
        account.id,
        account.verified ? 'account' : 'pending',
        input.remember === true,
        now,
      );
    }
    case 'logout':
      signOut();
      return clear;
    case 'forgot': {
      const account = byEmail(db, input.email);
      if (
        account?.verified &&
        account.lifecycle === 'Active' &&
        !recentlyQueued(db, 'reset', account.id, now)
      )
        enqueue(db, config, account, 'reset', account.email, now);
      return { message: 'Se houver uma conta elegível, receberás instruções por email.' };
    }
    case 'verify': {
      const link = lookupLink(db, input.token, now, ['verify']);
      const account = loadUser(db, link.user_id);
      verifyPass(account, input.password);
      if (account.verified || account.email !== link.target) deny(badLink);
      db.prepare('UPDATE users SET verified=1 WHERE id=?').run(account.id);
      invalidate(db, account.id);
      const intent = db.prepare('SELECT digest FROM registration_intents WHERE user_id=?').get(account.id);
      let message = 'Email confirmado. Entra na tua conta.';
      if (intent) {
        db.prepare('DELETE FROM registration_intents WHERE user_id=?').run(account.id);
        try {
          acceptInvite(db, config, account.id, String(intent.digest), now);
          message = 'Email confirmado e convite aceite. Entra para abrir o espaço partilhado.';
        } catch (error) {
          if (!(error instanceof IdentityError) || error.code !== 'INVITE') throw error;
          message =
            'Email confirmado. O convite deixou de estar disponível. Entra para criares um espaço ou aceitares um novo convite nas definições.';
        }
      }
      return { message };
    }
    case 'reset': {
      const link = lookupLink(db, input.token, now, ['reset']);
      const account = loadUser(db, link.user_id);
      if (!account.verified || link.target !== account.email) deny(badLink);
      db.prepare('UPDATE credentials SET password_hash=? WHERE user_id=?').run(
        encode(input.newPassword),
        account.id,
      );
      invalidate(db, account.id);
      enqueue(db, config, account, 'notice', account.email, now);
      return { message: 'Palavra-passe atualizada. Entra novamente.' };
    }
    case 'recoverMfa': {
      const account = byEmail(db, input.email);
      verifyPass(account, input.password);
      if (!account?.verified || account.lifecycle !== 'Active' || !account.totp) deny();
      consumeCode(db, account.id, input.code);
      sessionsOff(db, account.id);
      signOut();
      return createSession(db, account.id, 'replace', false, now);
    }
    case 'recoverEmail': {
      const account = byEmail(db, input.email);
      if (
        !account?.verified ||
        account.lifecycle !== 'Active' ||
        account.totp ||
        input.newEmail === account.email
      )
        deny();
      // Hold the code through confirmation. The holder may correct the target or replace an expired link.
      // Only one challenge can be current. Completion invalidates the entire old set atomically.
      if (
        !db
          .prepare('SELECT 1 FROM recovery_codes WHERE user_id=? AND digest=?')
          .get(account.id, digest(input.code))
      )
        deny();
      invalidate(db, account.id);
      db.prepare('UPDATE users SET pending_email=? WHERE id=?').run(input.newEmail, account.id);
      enqueue(db, config, account, 'recoverEmail', input.newEmail, now);
      enqueue(db, config, account, 'notice', account.email, now);
      return { message: 'Confirma o novo endereço através da ligação enviada.' };
    }
    case 'confirmEmail': {
      const link = lookupLink(db, input.token, now, ['email', 'recoverEmail']);
      const account = loadUser(db, link.user_id);
      if (!account.verified || account.pending_email !== link.target || byEmail(db, link.target))
        deny(badLink);
      if (link.kind === 'recoverEmail') {
        if (account.totp || !input.newPassword)
          deny('Define uma nova palavra-passe para concluir a recuperação.', 400, 'newPassword');
        db.prepare('UPDATE credentials SET password_hash=? WHERE user_id=?').run(
          encode(input.newPassword),
          account.id,
        );
        db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(account.id);
      }
      db.prepare('UPDATE users SET email=? WHERE id=?').run(link.target, account.id);
      db.prepare('DELETE FROM registration_intents WHERE user_id=?').run(account.id);
      invalidate(db, account.id);
      enqueue(db, config, account, 'notice', account.email, now);
      return { message: 'Novo email confirmado. Entra com o endereço atualizado.' };
    }
  }

  if (!session || !user) deny('A sessão terminou. Volta a entrar.', 401);
  if (input.action === 'activity') {
    db.prepare('UPDATE sessions SET active=? WHERE id=?').run(now, session.id);
    return {};
  }
  if (input.action === 'resend' && session.scope === 'pending' && !user.verified) {
    if (recentlyQueued(db, 'verify', user.id, now))
      deny('Aguarda um minuto antes de pedir outra ligação.', 429);
    enqueue(db, config, user, 'verify', user.email, now);
    return { message: 'Foi pedida uma nova ligação.' };
  }
  if (
    user.lifecycle === 'PendingClosure' &&
    !['deleteSpace', 'cancelDeletion', 'cancelProposal', 'proposeTransfer'].includes(input.action)
  )
    deny('Acesso restrito ao encerramento.');
  if (session.scope === 'pending' || !user.verified) deny('É necessário confirmar o email.');
  if (session.scope === 'replace' && input.action !== 'enroll' && input.action !== 'activate')
    deny('Conclui a substituição do autenticador.');
  db.prepare('UPDATE sessions SET active=? WHERE id=?').run(now, session.id);
  const renew = () => {
    invalidate(db, user.id);
    return createSession(db, user.id, 'account', false, now);
  };
  if (
    (input.action === 'revoke' || input.action === 'revokeAll') &&
    session.authenticated + policy.recent <= now
  )
    deny('Confirma a tua identidade antes de gerir as sessões.', 428);
  switch (input.action) {
    case 'closeAccount': {
      verifyProof(db, config, user, input.password, input.otp, now);
      db.prepare("UPDATE users SET lifecycle='PendingClosure' WHERE id=?").run(user.id);
      invalidate(db, user.id);
      db.prepare('DELETE FROM mail_jobs WHERE user_id=?').run(user.id);
      if (finishClosure(db, user.id, now, config.key))
        return { ...clear, message: 'A tua conta foi encerrada.' };
      return {
        ...createSession(db, user.id, 'account', false, now),
        message: 'Conta em encerramento. Resolve cada espaço próprio.',
      };
    }
    case 'cancelProposal':
    case 'deleteSpace':
    case 'cancelDeletion': {
      verifyProof(db, config, user, input.password, input.otp, now);
      const space = db
        .prepare('SELECT delete_due FROM spaces WHERE id=? AND owner_id=? AND IsDeleted=0')
        .get(input.spaceId, user.id);
      if (!space || (space.delete_due !== null && Number(space.delete_due) <= now))
        deny('Espaço indisponível.');
      if (input.action === 'cancelProposal') {
        const r = db
          .prepare(
            "UPDATE ownership_transfers SET status='cancelled',closed=? WHERE space_id=? AND proposer=? AND status='pending'",
          )
          .run(now, input.spaceId, user.id);
        if (!r.changes) deny('A proposta já não está pendente.');
        return { message: 'Proposta cancelada.' };
      }
      const cancel = input.action === 'cancelDeletion';
      if (cancel === (space.delete_due === null)) deny('O estado do espaço mudou. Atualiza a página.', 409);
      db.prepare('UPDATE spaces SET delete_due=? WHERE id=?').run(
        cancel ? null : now + 7 * policy.day,
        input.spaceId,
      );
      if (!cancel) {
        db.prepare(
          "UPDATE ownership_transfers SET status='cancelled',closed=? WHERE space_id=? AND status='pending'",
        ).run(now, input.spaceId);
        db.prepare(
          "UPDATE space_invites SET status='revoked',address=NULL,closed=? WHERE space_id=? AND status='pending'",
        ).run(now, input.spaceId);
        db.prepare('DELETE FROM export_grants WHERE space_id=?').run(input.spaceId);
      }
      const message = cancel
        ? 'Eliminação cancelada. O espaço voltou a estar ativo.'
        : 'Eliminação pedida. O espaço fica sete dias em modo de leitura.';
      notifyMembers(db, input.spaceId, message, now);
      return { message };
    }
    case 'proposeTransfer':
      verifyProof(db, config, user, input.password, input.otp, now);
      proposeTransfer(db, input.spaceId, user.id, input.memberId, now);
      return { message: 'Proposta de transferência criada.' };
    case 'reauth': {
      verifyProof(db, config, user, input.password, input.otp, now);
      const next = opaque();
      db.prepare(
        'UPDATE sessions SET digest=?,authenticated=?,enrollment=NULL,enrollment_until=NULL WHERE id=?',
      ).run(digest(next), now, session.id);
      return {
        cookie: next,
        maxAge: session.remembered ? Math.floor((session.expires - now) / 1000) : undefined,
        message: 'Identidade confirmada. Podes gerir as sessões.',
      };
    }
    case 'interfaceLocale':
      db.prepare('UPDATE users SET interface_locale=? WHERE id=? AND interface_locale<>?').run(
        input.locale,
        user.id,
        input.locale,
      );
      return { message: 'Preferência de interface confirmada.' };
    case 'revoke':
      db.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').run(input.sessionId, user.id);
      return input.sessionId === session.id ? clear : { message: 'Sessão terminada.' };
    case 'revokeAll':
      sessionsOff(db, user.id);
      return clear;
    case 'password':
      verifyProof(db, config, user, input.password, input.otp, now);
      db.prepare('UPDATE credentials SET password_hash=? WHERE user_id=?').run(
        encode(input.newPassword),
        user.id,
      );
      enqueue(db, config, user, 'notice', user.email, now);
      return { ...renew(), message: 'Palavra-passe atualizada. As outras sessões terminaram.' };
    case 'email':
      verifyProof(db, config, user, input.password, input.otp, now);
      if (input.newEmail === user.email) deny('Escolhe um endereço diferente.', 400, 'newEmail');
      db.prepare("DELETE FROM challenges WHERE user_id=? AND kind IN('email','recoverEmail')").run(user.id);
      db.prepare('UPDATE users SET pending_email=? WHERE id=?').run(input.newEmail, user.id);
      enqueue(db, config, user, 'email', input.newEmail, now);
      enqueue(db, config, user, 'notice', user.email, now);
      return { message: 'Confirma o novo endereço. O endereço atual mantém-se até à confirmação.' };
    case 'codes':
      verifyProof(db, config, user, input.password, input.otp, now);
      return { ...renew(), codes: rotateCodes(db, user.id) };
    case 'enroll': {
      if (session.scope === 'account' && user.lifecycle !== 'PendingClosure') {
        if (user.totp) deny('Para substituir um autenticador perdido, usa a recuperação de acesso.');
        verifyProof(db, config, user, input.password ?? '', undefined, now);
      }
      const secret = new Secret({ size: 20 }).base32;
      db.prepare('UPDATE sessions SET enrollment=?,enrollment_until=?,authenticated=? WHERE id=?').run(
        seal(config.key, 'setup:' + session.id, secret),
        now + policy.recent,
        now,
        session.id,
      );
      return { secret, message: 'Adiciona a chave ao autenticador e confirma o primeiro código.' };
    }
    case 'activate': {
      if (
        !session.enrollment ||
        !session.enrollment_until ||
        session.enrollment_until <= now ||
        session.authenticated + policy.recent <= now
      )
        deny('Volta a iniciar a configuração do autenticador.');
      const secret = unseal(config.key, 'setup:' + session.id, session.enrollment);
      const step = otpStep(secret, input.otp, now, -1);
      db.prepare('UPDATE credentials SET totp=?,last_step=? WHERE user_id=?').run(
        seal(config.key, 'totp:' + user.id, secret),
        step,
        user.id,
      );
      enqueue(db, config, user, 'notice', user.email, now);
      return {
        ...renew(),
        codes: rotateCodes(db, user.id),
        message: 'Autenticador ativado. Guarda os códigos de recuperação.',
      };
    }
    case 'disable':
      if (!user.totp) deny();
      verifyProof(db, config, user, input.password, input.otp, now);
      db.prepare('UPDATE credentials SET totp=NULL,last_step=-1 WHERE user_id=?').run(user.id);
      enqueue(db, config, user, 'notice', user.email, now);
      return { ...renew(), codes: rotateCodes(db, user.id), message: 'Autenticador desativado.' };
    default:
      deny();
  }
}
