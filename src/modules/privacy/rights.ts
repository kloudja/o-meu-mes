import { calendarDeadline } from './deadline';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { unseal } from '../identity/secrets.mjs';
import { IdentityError } from '../identity/error';
import { filterFor, redact } from './redaction.mjs';

const message = z.string().trim().min(1).max(2000);
const id = z.uuid();
const form = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('submit'), text: message }),
  z.strictObject({ action: z.enum(['reply', 'clarify', 'extend']), id, text: message }),
  z.strictObject({
    action: z.literal('answer'),
    id,
    text: message,
    decision: z.enum(['granted', 'partial', 'refused']),
    recipients: message,
  }),
  z.strictObject({
    action: z.literal('redact'),
    id,
    spaceId: id,
    text: z.string().min(1).max(256),
    reason: message,
  }),
  z.strictObject({ action: z.literal('hold'), id, reason: message, days: z.int().min(1).max(90) }),
]);
const denied = () => new IdentityError('Pedido indisponível.', 403);

export function rights(
  db: DatabaseSync,
  user: string,
  operator: boolean,
  input: unknown,
  now: number,
  key: Buffer,
) {
  const handler = process.env.OMEUMES_RIGHTS_HANDLER;
  const available =
    !!handler &&
    !!db
      .prepare(
        "SELECT 1 FROM users u JOIN credentials c ON c.user_id=u.id WHERE u.id=? AND u.lifecycle='Active' AND u.verified=1 AND c.totp IS NOT NULL",
      )
      .get(handler);
  if (input === undefined) {
    const cases = db
      .prepare(
        `SELECT id,received,due,state,subject=? AS mine FROM privacy_cases WHERE subject=? OR (handler=? AND ?=1) ORDER BY received DESC`,
      )
      .all(user, user, user, Number(operator));
    return {
      available,
      operator,
      cases: cases.map((c) => ({
        ...c,
        mine: Boolean(c.mine),
        messages: db
          .prepare('SELECT at,sender,text FROM privacy_messages WHERE case_id=? ORDER BY rowid')
          .all(c.id),
      })),
      notices: db
        .prepare('SELECT message,at FROM privacy_notices WHERE user_id=? ORDER BY rowid DESC LIMIT 20')
        .all(user),
    };
  }
  const parsed = form.safeParse(input);
  if (!parsed.success) throw new IdentityError('Revê o pedido e o texto indicado.', 422);
  const p = parsed.data;
  const add = (id: string, sender: string, text: string) =>
    db.prepare('INSERT INTO privacy_messages VALUES(?,?,?,?)').run(id, now, sender, text);
  if (p.action === 'submit') {
    if (!handler || !available || handler === user)
      throw new IdentityError('O canal de direitos aguarda um destinatário habilitado.', 503);
    const caseId = randomUUID();
    db.prepare(
      "INSERT INTO privacy_cases(id,subject,handler,received,due,state) VALUES(?,?,?,?,?,'open')",
    ).run(caseId, user, handler, now, calendarDeadline(now));
    add(caseId, 'Titular', p.text);
    return { message: 'Pedido recebido. Podes acompanhar a resposta aqui.' };
  }
  const record = db.prepare('SELECT * FROM privacy_cases WHERE id=?').get(p.id);
  if (!record) throw denied();
  if (p.action === 'reply') {
    if (record.subject !== user || record.closed !== null) throw denied();
    add(p.id, 'Titular', p.text);
    db.prepare("UPDATE privacy_cases SET state='open' WHERE id=?").run(p.id);
  } else {
    if (!operator || record.handler !== user || record.subject === user) throw denied();
    if (p.action === 'hold') {
      if (record.closed === null) throw denied();
      db.prepare('UPDATE privacy_cases SET hold_reason=?,retain_until=? WHERE id=?').run(
        p.reason,
        now + p.days * 86400000,
        p.id,
      );
    } else {
      if (record.closed !== null) throw denied();
      if (p.action === 'redact') {
        if (
          !db
            .prepare('SELECT 1 FROM memberships WHERE user_id=? AND space_id=?')
            .get(record.subject, p.spaceId)
        )
          throw denied();
        if (p.reason.includes(p.text))
          throw new IdentityError('Fundamenta sem repetir o conteúdo a retirar.', 422);
        const filter = filterFor(key, p.spaceId, p.text);
        const matches = redact(db, p.spaceId, filter, key, p.text);
        db.prepare('INSERT OR REPLACE INTO privacy_filters VALUES(?,?,?)').run(p.spaceId, filter, now);
        for (const row of db.prepare('SELECT rowid,text FROM privacy_messages WHERE case_id=?').all(p.id))
          if (matches(row.text))
            db.prepare(
              "UPDATE privacy_messages SET text='Conteúdo retirado no tratamento do pedido.' WHERE rowid=?",
            ).run(row.rowid);
        for (const job of db
          .prepare('SELECT id,payload,challenge FROM mail_jobs WHERE user_id=? AND payload IS NOT NULL')
          .all(record.subject)) {
          const envelope = JSON.parse(unseal(key, 'mail:' + job.id, job.payload));
          if (matches(envelope.to)) {
            db.prepare('DELETE FROM mail_jobs WHERE id=?').run(job.id);
            if (job.challenge) db.prepare('DELETE FROM challenges WHERE id=?').run(job.challenge);
          }
        }
        db.prepare(
          `INSERT INTO privacy_notices SELECT m.user_id,?,? FROM memberships m JOIN users u ON u.id=m.user_id WHERE space_id=? AND u.lifecycle!='Deleted'`,
        ).run(
          now,
          'Foi retirado conteúdo pessoal de um histórico partilhado a que tiveste acesso. Os valores financeiros foram preservados.',
          p.spaceId,
        );
        add(p.id, 'Responsável', 'Redação efetuada. ' + p.reason);
      } else if (p.action === 'extend') {
        if (now > Number(record.due) || record.due !== calendarDeadline(Number(record.received)))
          throw new IdentityError('O prazo inicial já terminou ou foi prorrogado.', 409);
        db.prepare('UPDATE privacy_cases SET due=? WHERE id=?').run(
          calendarDeadline(Number(record.received), 3),
          p.id,
        );
        add(p.id, 'Responsável', 'Prazo prorrogado. ' + p.text);
      } else if (p.action === 'clarify') {
        db.prepare("UPDATE privacy_cases SET state='clarify' WHERE id=?").run(p.id);
        add(p.id, 'Responsável', p.text);
      } else if (p.action === 'answer') {
        add(
          p.id,
          'Responsável',
          {
            granted: 'Pedido deferido.',
            partial: 'Pedido parcialmente deferido.',
            refused: 'Pedido recusado.',
          }[p.decision] +
            ' ' +
            p.text +
            '\nDestinatários: ' +
            p.recipients +
            (p.decision === 'granted'
              ? ''
              : '\nPodes apresentar reclamação à CNPD e recorrer aos tribunais.'),
        );
        db.prepare("UPDATE privacy_cases SET state='answered',closed=? WHERE id=?").run(now, p.id);
      }
    }
    db.prepare('INSERT INTO privacy_audit VALUES(?,?,?)').run(p.id, p.action, now);
  }
  return { message: 'Pedido atualizado.' };
}
