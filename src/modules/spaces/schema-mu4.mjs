// Preserve membership keys referenced by financial authorship and receipts.
export const mu4Schema = `
DROP TRIGGER space_owner_update;
CREATE TABLE memberships_mu4(
 space_id TEXT NOT NULL REFERENCES spaces(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN('owner','editor','reader')),
 IsDeleted INTEGER NOT NULL DEFAULT 0 CHECK(IsDeleted IN(0,1)),
 AddedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ModifiedAt TEXT, DeletedAt TEXT,
 PRIMARY KEY(space_id,user_id),
 CHECK((IsDeleted=0 AND DeletedAt IS NULL) OR (IsDeleted=1 AND DeletedAt IS NOT NULL AND ModifiedAt=DeletedAt)),
 CHECK(role!='owner' OR IsDeleted=0)
) STRICT;
INSERT INTO memberships_mu4 SELECT * FROM memberships;
DROP TABLE memberships;
ALTER TABLE memberships_mu4 RENAME TO memberships;
CREATE UNIQUE INDEX memberships_owner ON memberships(space_id) WHERE role='owner';
CREATE INDEX memberships_user_active ON memberships(user_id,space_id) WHERE IsDeleted=0;
CREATE TRIGGER membership_owner_insert BEFORE INSERT ON memberships
 WHEN (NEW.role='owner') != (NEW.user_id=(SELECT owner_id FROM spaces WHERE id=NEW.space_id))
 OR EXISTS(SELECT 1 FROM memberships WHERE space_id=NEW.space_id AND user_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'invalid membership insertion'); END;
CREATE TRIGGER membership_owner_update BEFORE UPDATE OF space_id,user_id,role ON memberships
 WHEN OLD.space_id!=NEW.space_id OR OLD.user_id!=NEW.user_id
 OR (NEW.role='owner') != (NEW.user_id=(SELECT owner_id FROM spaces WHERE id=NEW.space_id))
 BEGIN SELECT RAISE(ABORT,'invalid membership update'); END;
CREATE TRIGGER membership_owner_delete BEFORE DELETE ON memberships
 WHEN OLD.role='owner' BEGIN SELECT RAISE(ABORT,'space owner required'); END;

CREATE TABLE space_creations(
 creator_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL,
 space_id TEXT NOT NULL UNIQUE REFERENCES spaces(id),
 PRIMARY KEY(creator_id,request_id)
) STRICT;
INSERT INTO space_creations SELECT owner_id,creation_key,id FROM spaces;

CREATE TABLE space_invites(
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id),
 issuer_id TEXT NOT NULL, recipient TEXT NOT NULL, address TEXT, digest TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN('editor','reader')),
 created INTEGER NOT NULL, expires INTEGER NOT NULL CHECK(expires>created),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','revoked','expired')),
 closed INTEGER, accepted_by TEXT,
 CHECK((status='pending')=(closed IS NULL)), CHECK((status='accepted')=(accepted_by IS NOT NULL)),
 CHECK((status='pending')=(address IS NOT NULL)),
 FOREIGN KEY(space_id,issuer_id) REFERENCES memberships(space_id,user_id),
 FOREIGN KEY(space_id,accepted_by) REFERENCES memberships(space_id,user_id)
) STRICT;
CREATE UNIQUE INDEX invite_recipient_pending ON space_invites(space_id,recipient) WHERE status='pending';

CREATE TABLE ownership_transfers(
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), proposer TEXT NOT NULL, recipient TEXT NOT NULL,
 created INTEGER NOT NULL, expires INTEGER NOT NULL CHECK(expires>created),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','cancelled','expired')),
 closed INTEGER,
 CHECK(proposer!=recipient), CHECK((status='pending')=(closed IS NULL)),
 FOREIGN KEY(space_id,proposer) REFERENCES memberships(space_id,user_id),
 FOREIGN KEY(space_id,recipient) REFERENCES memberships(space_id,user_id)
) STRICT;
CREATE UNIQUE INDEX transfer_space_pending ON ownership_transfers(space_id) WHERE status='pending';

CREATE TRIGGER space_no_replace BEFORE INSERT ON spaces
 WHEN EXISTS(SELECT 1 FROM spaces WHERE id=NEW.id OR (owner_id=NEW.owner_id AND creation_key=NEW.creation_key))
 BEGIN SELECT RAISE(ABORT,'space already exists'); END;
CREATE TRIGGER space_owner_update BEFORE UPDATE OF owner_id ON spaces
 WHEN OLD.owner_id!=NEW.owner_id AND (
 OLD.IsDeleted!=0 OR NEW.IsDeleted!=0 OR NOT EXISTS(
 SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
 WHERE m.space_id=OLD.id AND m.user_id=NEW.owner_id AND m.IsDeleted=0 AND u.verified=1))
 BEGIN SELECT RAISE(ABORT,'invalid owner transition'); END;
CREATE TRIGGER space_owner_roles AFTER UPDATE OF owner_id ON spaces WHEN OLD.owner_id!=NEW.owner_id
 BEGIN
 UPDATE memberships SET role='editor',ModifiedAt=NEW.ModifiedAt WHERE space_id=NEW.id AND user_id=OLD.owner_id;
 UPDATE memberships SET role='owner',ModifiedAt=NEW.ModifiedAt WHERE space_id=NEW.id AND user_id=NEW.owner_id;
 END;

CREATE TRIGGER membership_restrictions AFTER UPDATE OF IsDeleted,role ON memberships
 WHEN (OLD.IsDeleted=0 AND NEW.IsDeleted=1) OR (OLD.role='editor' AND NEW.role='reader')
 BEGIN
 UPDATE receipts SET status='closed',ModifiedAt=NEW.ModifiedAt
 WHERE space_id=NEW.space_id AND user_id=NEW.user_id AND status='pending';
 END;
CREATE TRIGGER membership_removed AFTER UPDATE OF IsDeleted ON memberships
 WHEN OLD.IsDeleted=0 AND NEW.IsDeleted=1
 BEGIN
 UPDATE ownership_transfers SET status='cancelled',closed=CAST(unixepoch('subsec')*1000 AS INTEGER)
 WHERE space_id=NEW.space_id AND recipient=NEW.user_id AND status='pending';
 END;
CREATE TRIGGER space_sharing_closed AFTER UPDATE OF IsDeleted ON spaces
 WHEN OLD.IsDeleted=0 AND NEW.IsDeleted=1
 BEGIN
 UPDATE ownership_transfers SET status='cancelled',closed=CAST(unixepoch('subsec')*1000 AS INTEGER)
 WHERE space_id=NEW.id AND status='pending';
 UPDATE space_invites SET status='revoked',address=NULL,closed=CAST(unixepoch('subsec')*1000 AS INTEGER)
 WHERE space_id=NEW.id AND status='pending';
 END;
`;
