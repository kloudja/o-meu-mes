const guarded = [
  'users',
  'credentials',
  'memberships',
  'spaces',
  'privacy_cases',
  'privacy_messages',
  'privacy_filters',
  'receipts',
  'privacy_notices',
  'privacy_audit',
  'legacy_receipts',
  'space_invites',
  'ownership_transfers',
];
export const fences = guarded
  .flatMap((table) =>
    ['INSERT', 'UPDATE', 'DELETE'].map(
      (op) =>
        `CREATE TEMP TRIGGER fence_${table}_${op} BEFORE ${op} ON ${table} WHEN (SELECT registered FROM privacy_control)=1 AND (SELECT restored FROM identity_control)=0 BEGIN SELECT recovery_fence(); END;`,
    ),
  )
  .join('\n');
export const mu5Schema = `
INSERT INTO documents VALUES('privacy','dev-3','PT','pt-PT','2026-11-20','Privacidade','Informação de desenvolvimento. A conta guarda nome, email, residência e aceitação dos termos. Os membros autorizados consultam o histórico comum. A área Privacidade permite apresentar e acompanhar pedidos privados. O encerramento da conta exige resolver os espaços próprios. Consulta os prazos e o canal alternativo em /privacidade.');
ALTER TABLE users ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'Active' CHECK(lifecycle IN('Active','PendingClosure','Deleted'));
ALTER TABLE spaces ADD COLUMN delete_due INTEGER;
CREATE TABLE privacy_control(id INTEGER PRIMARY KEY CHECK(id=1), lineage TEXT NOT NULL, registered INTEGER NOT NULL DEFAULT 0, released INTEGER NOT NULL DEFAULT 0, last_cleanup INTEGER, backup_at INTEGER, backup_tag TEXT) STRICT;
INSERT INTO privacy_control(id,lineage) VALUES(1,lower(hex(randomblob(16))));
CREATE TABLE privacy_cases(id TEXT PRIMARY KEY, subject TEXT NOT NULL REFERENCES users(id), handler TEXT NOT NULL REFERENCES users(id), received INTEGER NOT NULL, due INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN('open','clarify','answered')),closed INTEGER, retain_until INTEGER, hold_reason TEXT) STRICT;
CREATE TABLE privacy_messages(case_id TEXT NOT NULL REFERENCES privacy_cases ON DELETE CASCADE, at INTEGER NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL) STRICT;
CREATE TABLE privacy_audit(case_id TEXT, action TEXT NOT NULL, at INTEGER NOT NULL) STRICT;
CREATE TABLE privacy_notices(user_id TEXT NOT NULL REFERENCES users(id),at INTEGER NOT NULL,message TEXT NOT NULL) STRICT;
CREATE TABLE privacy_filters(space_id TEXT NOT NULL REFERENCES spaces(id), digest TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(space_id,digest)) STRICT;
CREATE TABLE export_grants(digest TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),owner TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL) STRICT;
CREATE TABLE privacy_gate(space_id TEXT PRIMARY KEY, purpose TEXT NOT NULL CHECK(purpose IN('purge','redact'))) STRICT;
DROP TRIGGER snapshot_immutable;
CREATE TRIGGER snapshot_immutable BEFORE UPDATE ON snapshots WHEN NOT EXISTS(SELECT 1 FROM privacy_gate WHERE space_id=OLD.space_id) BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
DROP TRIGGER snapshot_no_delete;
CREATE TRIGGER snapshot_no_delete BEFORE DELETE ON snapshots WHEN NOT EXISTS(SELECT 1 FROM privacy_gate WHERE space_id=OLD.space_id AND purpose='purge') BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
DROP TRIGGER membership_owner_delete;
CREATE TRIGGER membership_owner_delete BEFORE DELETE ON memberships WHEN OLD.role='owner' AND NOT EXISTS(SELECT 1 FROM privacy_gate WHERE space_id=OLD.space_id AND purpose='purge') BEGIN SELECT RAISE(ABORT,'space owner required'); END;
DROP TRIGGER event_reversal_delete;
CREATE TRIGGER event_reversal_delete BEFORE DELETE ON events WHEN (OLD.reverses IS NOT NULL OR EXISTS(SELECT 1 FROM events WHERE space_id=OLD.space_id AND period=OLD.period AND reverses=OLD.id)) AND NOT EXISTS(SELECT 1 FROM privacy_gate WHERE space_id=OLD.space_id AND purpose='purge') BEGIN SELECT RAISE(ABORT,'immutable reversal'); END;
CREATE INDEX privacy_due ON spaces(delete_due) WHERE delete_due IS NOT NULL;
CREATE INDEX privacy_case_subject ON privacy_cases(subject);
CREATE INDEX privacy_case_handler ON privacy_cases(handler);
`;
