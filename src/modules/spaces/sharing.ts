import { createHmac, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { IdentityError } from '../identity/error';
import { email } from '../identity/input';
import { policy, type settings } from '../identity/policy.mjs';
import { digest, opaque, seal, unseal } from '../identity/secrets.mjs';
import { finishClosure } from '../privacy/lifecycle.mjs';
import { spaceRole } from './access';

type Config = ReturnType<typeof settings>;
const roles = z.enum(['editor', 'reader']);
const id = z.uuid();
const code = z
  .string()
  .trim()
  .regex(/^[\w-]{43}$/);
export const sharingInput = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('acceptInvite'), code }),
  z.strictObject({ action: z.literal('issue'), email, role: roles }),
  z.strictObject({ action: z.enum(['regenerate', 'revoke']), id }),
  z.strictObject({ action: z.literal('role'), memberId: id, role: roles }),
  z.strictObject({ action: z.literal('remove'), memberId: id }),
  z.strictObject({ action: z.literal('leave') }),
  z.strictObject({ action: z.enum(['acceptTransfer', 'declineTransfer', 'cancelTransfer']), id }),
]);
type SharingInput = z.infer<typeof sharingInput>;
type Invitation = {
  id: string;
  space_id: string;
  recipient: string;
  address: string | null;
  digest: string;
  role: 'reader' | 'editor';
  created: number;
  expires: number;
  status: 'pending' | 'revoked' | 'accepted' | 'expired';
  accepted_by: string | null;
};
type Transfer = {
  id: string;
  proposer: string;
  recipient: string;
  expires: number;
  status: string;
};
const matchRecipient = (config: Config, space: string, address: string) =>
  createHmac('sha256', config.key)
    .update('invite:' + space + ':' + address)
    .digest('hex');
const time = (now: number) => new Date(now).toISOString();
const invalidInvite = (field = 'code') =>
  new IdentityError(
    'O convite é inválido, expirou ou não está disponível para este email.',
    422,
    field,
    'INVITE',
  );
const unavailable = () => new IdentityError('Ação indisponível neste espaço.', 403);
const transferUnavailable = () => new IdentityError('Esta proposta já não está disponível.', 409);
const revokeInvites = `UPDATE space_invites SET status='revoked',address=NULL,closed=?
  WHERE space_id=? AND status='pending'`;

function findInvitation(db: DatabaseSync, config: Config, address: string, hash: string) {
  if (!db.isTransaction) throw new Error('Transação de convite necessária.');
  const invite = db
    .prepare(`SELECT i.* FROM space_invites i JOIN spaces s ON s.id=i.space_id
    WHERE i.digest=? AND s.IsDeleted=0 AND s.delete_due IS NULL AND (i.status='accepted' OR i.issuer_id=s.owner_id)`)
    .get(hash) as Invitation | undefined;
  if (!invite || invite.recipient !== matchRecipient(config, invite.space_id, address)) return;
  return invite;
}
export function registrationInvite(
  db: DatabaseSync,
  config: Config,
  address: string,
  secret: string,
  now: number,
) {
  const invite = findInvitation(db, config, address, digest(secret));
  if (invite?.status !== 'pending' || invite.expires <= now) throw invalidInvite('invite');
  return invite;
}
export function acceptInvite(db: DatabaseSync, config: Config, userId: string, hash: string, now: number) {
  const user = db
    .prepare("SELECT email FROM users WHERE id=? AND verified=1 AND lifecycle='Active'")
    .get(userId);
  if (!user) throw invalidInvite();
  const invite = findInvitation(db, config, String(user.email), hash);
  if (!invite) throw invalidInvite();
  const membership = db
    .prepare('SELECT role,IsDeleted FROM memberships WHERE space_id=? AND user_id=?')
    .get(invite.space_id, userId);
  if (invite.status === 'accepted' && invite.accepted_by === userId && membership?.IsDeleted === 0)
    return { spaceId: invite.space_id };
  if (invite.status !== 'pending' || invite.expires <= now) throw invalidInvite();
  if (!membership) {
    db.prepare('INSERT INTO memberships(space_id,user_id,role) VALUES(?,?,?)').run(
      invite.space_id,
      userId,
      invite.role,
    );
  } else if (membership.IsDeleted) {
    db.prepare(`UPDATE memberships SET role=?,IsDeleted=0,ModifiedAt=?,DeletedAt=NULL
      WHERE space_id=? AND user_id=?`).run(invite.role, time(now), invite.space_id, userId);
  }
  db.prepare(`UPDATE space_invites SET status='accepted',address=NULL,closed=?,accepted_by=? WHERE id=?`).run(
    now,
    userId,
    invite.id,
  );
  return { spaceId: invite.space_id };
}

function issue(
  db: DatabaseSync,
  config: Config,
  space: string,
  issuer: string,
  address: string,
  role: Invitation['role'],
  now: number,
) {
  const recipient = matchRecipient(config, space, address);
  db.prepare(`UPDATE space_invites SET status=CASE WHEN expires<=? THEN 'expired' ELSE 'revoked' END,
    address=NULL,closed=min(expires,?) WHERE space_id=? AND status='pending' AND recipient=?`).run(
    now,
    now,
    space,
    recipient,
  );
  const inviteId = randomUUID();
  const secret = opaque();
  const expires = now + config.inviteLifetime;
  db.prepare(`INSERT INTO space_invites(id,space_id,issuer_id,recipient,address,digest,role,created,expires)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(
    inviteId,
    space,
    issuer,
    recipient,
    seal(config.key, 'invite:' + inviteId, address),
    digest(secret),
    role,
    now,
    expires,
  );
  return { id: inviteId, code: secret, expires };
}

export function proposeTransfer(
  db: DatabaseSync,
  space: string,
  owner: string,
  recipient: string,
  now: number,
) {
  if (
    spaceRole(db, owner, space, now) !== 'owner' ||
    db.prepare('SELECT 1 FROM spaces WHERE id=? AND delete_due IS NOT NULL').get(space)
  )
    throw unavailable();
  if (
    !db
      .prepare(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.space_id=? AND m.user_id=? AND m.IsDeleted=0 AND m.role!='owner' AND u.verified=1 AND u.lifecycle='Active'`)
      .get(space, recipient)
  )
    throw transferUnavailable();
  db.prepare(`UPDATE ownership_transfers SET status='expired',closed=expires
    WHERE space_id=? AND status='pending' AND expires<=?`).run(space, now);
  if (db.prepare("SELECT 1 FROM ownership_transfers WHERE space_id=? AND status='pending'").get(space))
    throw new IdentityError('Já existe uma proposta. Cancela-a antes de criar outra.', 409);
  db.prepare(`INSERT INTO ownership_transfers(id,space_id,proposer,recipient,created,expires)
    VALUES(?,?,?,?,?,?)`).run(randomUUID(), space, owner, recipient, now, now + policy.invite);
}

export function readSharing(db: DatabaseSync, config: Config, space: string, user: string, now: number) {
  const role = spaceRole(db, user, space);
  const members = db
    .prepare(`SELECT m.user_id AS id,u.first_name||' '||u.last_name AS name,m.role
    FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.space_id=? AND m.IsDeleted=0
    ORDER BY m.role='owner' DESC,u.first_name,u.last_name,u.id`)
    .all(space);
  const invites =
    role === 'owner'
      ? (
          db
            .prepare(`SELECT id,address,role,expires FROM space_invites
        WHERE space_id=? AND issuer_id=? AND status='pending' AND expires>? ORDER BY created DESC`)
            .all(space, user, now) as Pick<Invitation, 'id' | 'address' | 'role' | 'expires'>[]
        ).map((i) => ({
          id: i.id,
          email: unseal(config.key, 'invite:' + i.id, i.address!),
          role: i.role,
          expires: i.expires,
        }))
      : [];
  const transfer = db
    .prepare(`SELECT id,proposer,recipient,expires FROM ownership_transfers
    WHERE space_id=? AND status='pending' AND expires>? AND (proposer=? OR recipient=?)`)
    .get(space, now, user, user);
  const detail = db.prepare('SELECT name FROM spaces WHERE id=?').get(space);
  return {
    role,
    name: String(detail?.name),
    members,
    invites,
    transfer: transfer ?? null,
    shared: members.length > 1,
  };
}

export function changeSharing(
  db: DatabaseSync,
  config: Config,
  space: string | null,
  user: string,
  input: SharingInput,
  now: number,
) {
  if (input.action === 'acceptInvite') return acceptInvite(db, config, user, digest(input.code), now);
  if (!space) throw unavailable();
  const role = spaceRole(db, user, space);
  if (db.prepare('SELECT 1 FROM spaces WHERE id=? AND delete_due IS NOT NULL').get(space))
    throw unavailable();
  if (
    input.action === 'acceptTransfer' ||
    input.action === 'declineTransfer' ||
    input.action === 'cancelTransfer'
  ) {
    const proposal = db
      .prepare(`SELECT id,proposer,recipient,expires,status FROM ownership_transfers
      WHERE id=? AND space_id=?`)
      .get(input.id, space) as Transfer | undefined;
    const cancelling = input.action === 'cancelTransfer';
    if (
      !proposal ||
      (cancelling ? role !== 'owner' || proposal.proposer !== user : proposal.recipient !== user)
    )
      throw transferUnavailable();
    const accepted = input.action === 'acceptTransfer';
    const status = accepted ? 'accepted' : cancelling ? 'cancelled' : 'declined';
    if (proposal.status === status && (!accepted || role === 'owner')) return {};
    if (proposal.status !== 'pending' || proposal.expires <= now) throw transferUnavailable();
    const currentOwner = db.prepare('SELECT owner_id FROM spaces WHERE id=?').get(space)?.owner_id;
    if (currentOwner !== proposal.proposer) throw transferUnavailable();
    db.prepare('UPDATE ownership_transfers SET status=?,closed=? WHERE id=?').run(status, now, proposal.id);
    if (accepted) {
      db.prepare('UPDATE spaces SET owner_id=?,creation_key=?,ModifiedAt=? WHERE id=?').run(
        user,
        randomUUID(),
        time(now),
        space,
      );
      db.prepare(revokeInvites).run(now, space);
      db.prepare('DELETE FROM export_grants WHERE space_id=?').run(space);
      if (
        db.prepare("SELECT 1 FROM users WHERE id=? AND lifecycle='PendingClosure'").get(proposal.proposer)
      ) {
        removeMember(db, config, space, proposal.proposer, now);
        finishClosure(db, proposal.proposer, now, config.key);
      }
    }
    return {};
  }
  if (input.action === 'leave') {
    if (role === 'owner') throw new IdentityError('Transfere a propriedade antes de sair do espaço.', 403);
    removeMember(db, config, space, user, now);
    return {};
  }
  if (role !== 'owner') throw unavailable();
  switch (input.action) {
    case 'issue':
      return issue(db, config, space, user, input.email, input.role, now);
    case 'revoke':
    case 'regenerate': {
      const invite = db
        .prepare('SELECT * FROM space_invites WHERE id=? AND space_id=? AND issuer_id=?')
        .get(input.id, space, user) as Invitation | undefined;
      if (input.action === 'revoke' && invite?.status === 'revoked') return {};
      if (invite?.status !== 'pending' || invite.expires <= now) throw invalidInvite();
      if (input.action === 'regenerate')
        return issue(
          db,
          config,
          space,
          user,
          unseal(config.key, 'invite:' + invite.id, invite.address!),
          invite.role,
          now,
        );
      db.prepare(revokeInvites + ' AND id=?').run(now, space, invite.id);
      return {};
    }
    case 'remove':
      removeMember(db, config, space, input.memberId, now);
      return {};
    case 'role': {
      const updated = db
        .prepare(`UPDATE memberships SET role=?,ModifiedAt=?
        WHERE space_id=? AND user_id=? AND role!='owner' AND IsDeleted=0 AND role!=?`)
        .run(input.role, time(now), space, input.memberId, input.role);
      if (
        !updated.changes &&
        !db
          .prepare(`SELECT 1 FROM memberships WHERE space_id=? AND user_id=? AND
        IsDeleted=0 AND role=?`)
          .get(space, input.memberId, input.role)
      )
        throw unavailable();
      return {};
    }
  }
}
function removeMember(db: DatabaseSync, config: Config, space: string, member: string, now: number) {
  const result = db
    .prepare(`UPDATE memberships SET IsDeleted=1,ModifiedAt=?,DeletedAt=?
    WHERE space_id=? AND user_id=? AND IsDeleted=0 AND role!='owner'`)
    .run(time(now), time(now), space, member);
  if (!result.changes) {
    if (
      db
        .prepare('SELECT 1 FROM memberships WHERE space_id=? AND user_id=? AND IsDeleted=1')
        .get(space, member)
    )
      return;
    throw unavailable();
  }
  const address = String(db.prepare('SELECT email FROM users WHERE id=?').get(member)?.email);
  db.prepare(revokeInvites + ' AND recipient=?').run(now, space, matchRecipient(config, space, address));
}
