import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { connect } from '../../server/storage.mjs';
import { assertSynthetic } from '../../server/transition.mjs';
import { cleanPrivacy, retention } from '../privacy/lifecycle.mjs';
import { policy } from './policy.mjs';
import { digest, opaque, seal, unseal } from './secrets.mjs';

const templates = {
  'pt-PT': {
    verify: ['Confirma o teu email', 'Confirma o registo de O meu mês com a tua palavra-passe.'],
    reset: ['Recuperar a palavra-passe', 'Escolhe uma nova palavra-passe para a tua conta.'],
    email: ['Confirmar o novo email', 'Confirma este endereço para concluir a alteração.'],
    recoverEmail: [
      'Recuperar o acesso ao email',
      'Confirma este endereço e define a tua nova palavra-passe.',
    ],
    notice: [
      'Segurança da tua conta',
      'As credenciais ou os dados de acesso da tua conta O meu mês foram alterados.',
    ],
  },
};

export function enqueue(db, config, user, kind, to, now) {
  const id = randomUUID();
  let challenge = null;
  let token = '';
  if (kind !== 'notice') {
    db.prepare('INSERT OR REPLACE INTO auth_limits(id,started,count) VALUES(?,?,1)').run(
      'mail:' + kind + ':' + user.id,
      now,
    );
    db.prepare('DELETE FROM challenges WHERE user_id=? AND kind=?').run(user.id, kind);
    challenge = randomUUID();
    token = opaque();
    db.prepare('INSERT INTO challenges VALUES (?,?,?,?,?,?)').run(
      challenge,
      user.id,
      kind,
      to,
      digest(token),
      now + policy[kind],
    );
  }
  db.prepare(`INSERT INTO mail_jobs(id,user_id,challenge,kind,payload,locale,status,available,created,priority)
    VALUES(?,?,?,?,?,?,'pending',?,?,?)`).run(
    id,
    user.id,
    challenge,
    kind,
    seal(config.key, 'mail:' + id, JSON.stringify({ to, token })),
    user.communication_locale,
    now,
    now,
    kind === 'verify' ? 1 : 0,
  );
}

export function recentlyQueued(db, kind, userId, now) {
  return !!db
    .prepare('SELECT 1 FROM auth_limits WHERE id=? AND started>?')
    .get('mail:' + kind + ':' + userId, now - policy.resend);
}

function message(job, config, data) {
  const [subject, intro] = templates[job.locale][job.kind];
  const fragment = job.kind === 'recoverEmail' ? 'email' : job.kind;
  const link = data.token
    ? '\n\n' +
      config.origin +
      '/#' +
      fragment +
      '=' +
      data.token +
      (job.kind === 'recoverEmail' ? '&recovery=1' : '')
    : '';
  return { to: data.to, subject, text: intro + link + '\n\nO meu mês' };
}

export async function deliver(job, config, mail, path) {
  if (config.transport === 'test') {
    if (!config.mailbox) return { status: 'deferred' };
    assertSynthetic(path);
    const folder = join(dirname(path), 'mailbox');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = join(folder, job.id + '.json');
    try {
      writeFileSync(file, JSON.stringify(mail), { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    return { status: 'delivered' };
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(policy.transportTimeout),
    headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: config.sender, name: 'O meu mês' },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      headers: { idempotencyKey: job.id },
    }),
  });
  if (response.status === 201) {
    const body = await response.json();
    if (typeof body.messageId === 'string') return { status: 'accepted', providerId: body.messageId };
    return { status: 'deferred' };
  }
  if (response.status === 400 && (await response.json().catch(() => null))?.code === 'duplicate_parameter')
    return { status: 'accepted' };
  return { status: response.status === 429 || response.status >= 500 ? 'deferred' : 'failed' };
}

/** @param {import('node:sqlite').DatabaseSync} db @param {number} now @param {Buffer} [key] */
export function maintenance(db, now, key = undefined) {
  const v9 = db.prepare('PRAGMA user_version').get().user_version >= 9;
  const rules = retention();
  if (v9) cleanPrivacy(db, now, key);
  const remove = (table, where, ...args) =>
    db
      .prepare(
        'DELETE FROM ' +
          table +
          ' WHERE rowid IN(SELECT rowid FROM ' +
          table +
          ' WHERE ' +
          where +
          ' LIMIT 200)',
      )
      .run(...args);
  remove('registration_intents', 'expires<=?', now);
  if (db.prepare('PRAGMA user_version').get().user_version >= 8) {
    db.prepare(`UPDATE space_invites SET status='expired',address=NULL,closed=expires
      WHERE rowid IN(SELECT rowid FROM space_invites WHERE status='pending' AND expires<=? LIMIT 200)`).run(
      now,
    );
    remove('space_invites', 'closed<=?', now - rules.operations);
    db.prepare(`UPDATE ownership_transfers SET status='expired',closed=expires
      WHERE rowid IN(SELECT rowid FROM ownership_transfers WHERE status='pending' AND expires<=? LIMIT 200)`).run(
      now,
    );
  }
  db.prepare(
    'DELETE FROM users WHERE rowid IN(SELECT rowid FROM users WHERE verified=0 AND created<=?' +
      (v9 ? " AND lifecycle='Active'" : '') +
      ' LIMIT 200)',
  ).run(now - rules.unverified);
  remove(
    'sessions',
    'expires<=? OR active+CASE remembered WHEN 1 THEN ? ELSE ? END <=?',
    now,
    policy.rememberedIdle,
    policy.idle,
    now,
  );
  remove('auth_limits', 'started<=?', now - policy.day);
  remove('mail_jobs', 'created<=?', now - rules.operations);
  remove(
    'challenges',
    `expires<=? AND NOT EXISTS(SELECT 1 FROM mail_jobs WHERE challenge=challenges.id AND status IN('pending','deferred','sending'))`,
    now,
  );
}

// The lease and attempt number fence acknowledgements from slower workers. No network I/O under a write lock.
export async function dispatchOne(path, config, send = deliver, now = Date.now(), clean = true) {
  const db = connect(path);
  try {
    db.exec('BEGIN IMMEDIATE');
    if (!db.prepare('SELECT 1 FROM identity_control WHERE restored=0').get()) {
      db.exec('ROLLBACK');
      return false;
    }
    if (clean) maintenance(db, now, config.key);
    const job = db
      .prepare(`SELECT * FROM mail_jobs WHERE status IN ('pending','deferred','sending') AND available<=?
      ORDER BY priority,created LIMIT 1`)
      .get(now);
    if (!job) {
      const report =
        config.transport === 'brevo' &&
        db
          .prepare(`SELECT id,provider_id FROM mail_jobs WHERE status='accepted'
        AND provider_id IS NOT NULL AND available<=? AND created>? ORDER BY available LIMIT 1`)
          .get(now, now - policy.deliveryWindow);
      if (report)
        db.prepare('UPDATE mail_jobs SET available=? WHERE id=?').run(now + policy.deliveryCheck, report.id);
      db.exec('COMMIT');
      if (!report) return false;
      const url = new URL('https://api.brevo.com/v3/smtp/statistics/events');
      url.searchParams.set('messageId', report.provider_id);
      url.searchParams.set('event', 'delivered');
      url.searchParams.set('limit', '1');
      const response = await fetch(url, {
        headers: { 'api-key': config.apiKey },
        redirect: 'error',
        signal: AbortSignal.timeout(policy.transportTimeout),
      });
      if (
        response.ok &&
        (await response.json()).events?.some(
          (e) => e.event === 'delivered' && e.messageId === report.provider_id,
        )
      ) {
        db.prepare(
          "UPDATE mail_jobs SET status='delivered' WHERE id=? AND status='accepted' AND provider_id=?",
        ).run(report.id, report.provider_id);
      }
      return true;
    }
    const budget = db.prepare('SELECT * FROM auth_limits WHERE id=?').get('daily-mail');
    if (budget && budget.started + policy.day > now && budget.count >= policy.dailyMail) {
      db.prepare("UPDATE mail_jobs SET status='deferred',available=? WHERE id=?").run(
        budget.started + policy.day,
        job.id,
      );
      db.exec('COMMIT');
      return true;
    }
    if (job.attempts >= policy.maxDeliveries) {
      db.prepare("UPDATE mail_jobs SET status='failed',payload=NULL WHERE id=?").run(job.id);
      db.exec('COMMIT');
      return true;
    }
    const data = JSON.parse(unseal(config.key, 'mail:' + job.id, job.payload));
    if (job.challenge) {
      const challenge = db.prepare('SELECT expires FROM challenges WHERE id=?').get(job.challenge);
      if (challenge.expires <= now) {
        data.token = opaque();
        db.prepare('UPDATE challenges SET digest=?,expires=? WHERE id=?').run(
          digest(data.token),
          now + policy[job.kind],
          job.challenge,
        );
      }
    }
    db.prepare(
      `UPDATE mail_jobs SET status='sending',attempts=attempts+1,available=?,payload=? WHERE id=?`,
    ).run(now + policy.lease, seal(config.key, 'mail:' + job.id, JSON.stringify(data)), job.id);
    db.prepare(`INSERT INTO auth_limits VALUES('daily-mail',?,1) ON CONFLICT(id) DO UPDATE SET
      count=CASE WHEN started+?<=excluded.started THEN 1 ELSE count+1 END,
      started=CASE WHEN started+?<=excluded.started THEN excluded.started ELSE started END`).run(
      now,
      policy.day,
      policy.day,
    );
    db.exec('COMMIT');
    let outcome;
    try {
      outcome = await send(job, config, message(job, config, data), path);
    } catch {
      outcome = { status: 'deferred' };
    }
    const retry = outcome.status === 'deferred' && job.attempts + 1 < policy.maxDeliveries;
    const status = outcome.status === 'deferred' && !retry ? 'failed' : outcome.status;
    db.prepare(`UPDATE mail_jobs SET status=?,available=?,provider_id=?,payload=CASE WHEN ? THEN payload ELSE NULL END
      WHERE id=? AND status='sending' AND attempts=?`).run(
      status,
      now + policy.retry * 2 ** job.attempts,
      outcome.providerId ?? null,
      Number(retry),
      job.id,
      job.attempts + 1,
    );
    return true;
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
  }
}
