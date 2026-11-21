export function reversalInserts(scoped = false) {
  const filter = scoped ? ' AND space_id=?' : '';
  const effectsFilter = scoped ? ' AND r.space_id=?' : '';
  return [
    `WITH reversed AS MATERIALIZED (
 SELECT *, 'mu3-legacy-reversal:' || lower(hex(randomblob(16))) AS inverse_id
 FROM events WHERE IsDeleted=0 AND json_extract(payload,'$.voided')=1${filter}
)
INSERT INTO events(space_id,period,id,line_id,amount,payload)
 SELECT space_id,period,inverse_id,line_id,-amount,
 json_object('id',inverse_id,'type','reversal','date',json_extract(payload,'$.date'),'reverses',id,'historical',json('true'),
 'groupId',coalesce(replaced_by,id),'lineId',line_id,'line',json_extract(payload,'$.line'),
 'note','Compensação de anulação histórica')
 FROM reversed`,
    `INSERT INTO effects(space_id,period,event_id,source,delta)
 SELECT r.space_id,r.period,r.id,f.source,-f.delta FROM events r JOIN effects f
 ON (r.space_id,r.period,r.reverses)=(f.space_id,f.period,f.event_id)
 WHERE json_extract(r.payload,'$.historical')=1${effectsFilter}`,
  ];
}

export const mu3Schema = `
CREATE TABLE memberships_mu3(
 space_id TEXT NOT NULL REFERENCES spaces(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN('owner','editor')),
 IsDeleted INTEGER NOT NULL DEFAULT 0 CHECK(IsDeleted IN(0,1)),
 AddedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ModifiedAt TEXT, DeletedAt TEXT,
 PRIMARY KEY(space_id,user_id),
 CHECK((IsDeleted=0 AND DeletedAt IS NULL) OR (IsDeleted=1 AND DeletedAt IS NOT NULL AND ModifiedAt=DeletedAt)),
 CHECK(role!='owner' OR IsDeleted=0)
) STRICT;
INSERT INTO memberships_mu3 SELECT space_id,user_id,role,IsDeleted,AddedAt,ModifiedAt,DeletedAt FROM memberships;
DROP TABLE memberships;
ALTER TABLE memberships_mu3 RENAME TO memberships;
CREATE UNIQUE INDEX memberships_owner ON memberships(space_id) WHERE role='owner';
CREATE TRIGGER membership_owner_insert BEFORE INSERT ON memberships
 WHEN (NEW.role='owner') != (NEW.user_id=(SELECT owner_id FROM spaces WHERE id=NEW.space_id))
 BEGIN SELECT RAISE(ABORT,'invalid space owner'); END;
CREATE TRIGGER membership_owner_update BEFORE UPDATE OF space_id,user_id,role ON memberships
 WHEN OLD.space_id!=NEW.space_id OR OLD.user_id!=NEW.user_id OR OLD.role!=NEW.role
 BEGIN SELECT RAISE(ABORT,'immutable membership identity'); END;
CREATE TRIGGER membership_owner_delete BEFORE DELETE ON memberships
 WHEN OLD.role='owner' BEGIN SELECT RAISE(ABORT,'space owner required'); END;
CREATE TRIGGER space_owner_update BEFORE UPDATE OF owner_id ON spaces
 WHEN OLD.owner_id!=NEW.owner_id BEGIN SELECT RAISE(ABORT,'immutable space owner'); END;

ALTER TABLE meta ADD COLUMN mu3_start INTEGER NOT NULL DEFAULT 0;
UPDATE meta SET mu3_start=revision;
CREATE TABLE finance_versions(
 space_id TEXT NOT NULL REFERENCES spaces(id), resource TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=0), PRIMARY KEY(space_id,resource)
) STRICT;
ALTER TABLE receipts ADD COLUMN result_revision INTEGER;
ALTER TABLE receipts ADD COLUMN result_id TEXT;
ALTER TABLE events ADD COLUMN reverses TEXT GENERATED ALWAYS AS (json_extract(payload,'$.reverses')) VIRTUAL;
CREATE UNIQUE INDEX events_single_reversal ON events(space_id,period,reverses) WHERE reverses IS NOT NULL;
CREATE INDEX events_recent ON events(space_id,period,AddedAt);
CREATE TRIGGER reversal_target BEFORE INSERT ON events WHEN NEW.reverses IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM events WHERE space_id=NEW.space_id AND period=NEW.period AND id=NEW.reverses AND reverses IS NULL
) BEGIN SELECT RAISE(ABORT,'invalid reversal target'); END;
CREATE TRIGGER event_reversal_identity BEFORE UPDATE OF space_id,period,id,payload ON events
 WHEN OLD.space_id IS NOT NEW.space_id OR OLD.period IS NOT NEW.period OR OLD.id IS NOT NEW.id OR OLD.reverses IS NOT NEW.reverses
 BEGIN SELECT RAISE(ABORT,'immutable event link'); END;
CREATE TRIGGER event_reversal_delete BEFORE DELETE ON events WHEN OLD.reverses IS NOT NULL OR EXISTS(
 SELECT 1 FROM events WHERE space_id=OLD.space_id AND period=OLD.period AND reverses=OLD.id
) BEGIN SELECT RAISE(ABORT,'immutable reversal'); END;
${reversalInserts().join(';\n')};
`;
