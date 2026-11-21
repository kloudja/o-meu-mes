import { randomUUID } from 'node:crypto';

const timestamp = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const lifecycle = `AddedAt TEXT NOT NULL DEFAULT ${timestamp}, ModifiedAt TEXT, DeletedAt TEXT,
  IsDeleted INTEGER NOT NULL DEFAULT 0 CHECK(IsDeleted IN (0,1)),
  CHECK((IsDeleted=0 AND DeletedAt IS NULL) OR (IsDeleted=1 AND DeletedAt IS NOT NULL AND ModifiedAt=DeletedAt))`;
const payload = 'payload TEXT NOT NULL CHECK(json_valid(payload))';
const money = 'BETWEEN 0 AND 9007199254740991';
const signed = 'BETWEEN -9007199254740991 AND 9007199254740991';
const fk = (fields, table, keys = fields) =>
  `FOREIGN KEY(space_id,${fields}) REFERENCES ${table}(space_id,${keys}) DEFERRABLE INITIALLY DEFERRED`;
const account = fk('account_id', 'accounts', 'id'),
  category = fk('category_id', 'categories', 'id'),
  reserve = fk('reserve_id', 'reserves', 'id');
const month = fk('period', 'months'),
  line = fk('period,line_id', 'lines', 'period,id');
const event = (key) => fk('period,' + key, 'events', 'period,id');
const owner = fk('user_id', 'memberships');
const catalogKeys = 'account_id TEXT, category_id TEXT, reserve_id TEXT';
const catalogRefs = [account, category, reserve];
const jsonId = (key, path) =>
  `${key} TEXT GENERATED ALWAYS AS (nullif(json_extract(payload,'$.${path}'),'')) VIRTUAL`;
const payloadKeys = {
  accounts: { id: 'id' },
  categories: { id: 'id' },
  reserves: { id: 'id', account_id: 'accountId' },
  base_lines: { id: 'id', account_id: 'accountId', category_id: 'categoryId', reserve_id: 'reserveId' },
  lines: { id: 'id', account_id: 'accountId', category_id: 'categoryId', reserve_id: 'reserveId' },
  recurring: { id: 'id', account_id: 'accountId', reserve_id: 'reserveId' },
  events: { id: 'id', line_id: 'lineId' },
  occurrences: { id: 'id', definition_id: 'definitionId', line_id: 'lineId' },
};
const payloadChecks = (name) =>
  Object.entries(payloadKeys[name] ?? {}).map(
    ([col, key]) => `CHECK(nullif(json_extract(payload,'$.${key}'),'') IS ${col})`,
  );
const table = (name, keys, columns, refs = []) =>
  `CREATE TABLE ${name}(space_id TEXT NOT NULL REFERENCES spaces(id), ${columns}, ${lifecycle},
    PRIMARY KEY(space_id,${keys}), ${[...refs, ...payloadChecks(name), 'CHECK(length(space_id)>0)'].join(',')}) STRICT;`;

export const financialTables = [
  'accounts',
  'categories',
  'reserves',
  'origins',
  'base_lines',
  'recurring',
  'months',
  'lines',
  'initials',
  'snapshots',
  'events',
  'effects',
  'allocations',
  'observations',
  'occurrences',
  'excel_imports',
];
const oldTables = [...financialTables, 'meta', 'receipts'];
const dropOld = [...oldTables]
  .reverse()
  .map((t) => 'DROP TABLE ' + t + ';')
  .join('\n');
export const spaceSchema = `
INSERT INTO documents(kind,version,country,locale,effective,title,content) VALUES
 ('terms','dev-2','PT','pt-PT','2026-11-19','Termos de utilização','Versão de desenvolvimento para o registo local de adultos residentes em Portugal. Uma conta confirmada pode criar espaços financeiros privados em euros.'),
 ('privacy','dev-2','PT','pt-PT','2026-11-19','Privacidade','Versão de desenvolvimento. A conta guarda nome, email, residência, declaração de maioridade e aceitação dos termos. A autenticação usa um cookie e a confirmação usa email. O espaço guarda os dados financeiros e referências de confirmação. Só o proprietário tem acesso através do produto. O contacto do responsável e o procedimento de direitos aguardam aprovação antes da abertura pública.');
CREATE TRIGGER supported_user_preferences BEFORE UPDATE OF interface_locale,communication_locale ON users
 WHEN NEW.interface_locale!='pt-PT' OR NEW.communication_locale!='pt-PT' BEGIN SELECT RAISE(ABORT,'unsupported locale'); END;
CREATE TRIGGER supported_user_creation BEFORE INSERT ON users
 WHEN NEW.interface_locale!='pt-PT' OR NEW.communication_locale!='pt-PT' BEGIN SELECT RAISE(ABORT,'unsupported locale'); END;
DROP TRIGGER snapshot_no_delete;
DROP TRIGGER snapshot_immutable;
${dropOld}
CREATE TABLE spaces(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency='EUR'), creation_key TEXT NOT NULL, ${lifecycle},
 UNIQUE(owner_id,creation_key), UNIQUE(id,owner_id), FOREIGN KEY(id,owner_id) REFERENCES memberships(space_id,user_id) DEFERRABLE INITIALLY DEFERRED) STRICT;
CREATE TABLE memberships(space_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner' CHECK(role='owner'), ${lifecycle},
 CHECK(IsDeleted=0), UNIQUE(space_id,user_id), FOREIGN KEY(space_id,user_id) REFERENCES spaces(id,owner_id)) STRICT;
CREATE TABLE meta(space_id TEXT PRIMARY KEY REFERENCES spaces(id),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),format INTEGER NOT NULL DEFAULT 1 CHECK(format=1)) STRICT;
${table('accounts', 'id', `id TEXT NOT NULL, ${payload}`)}
${table('categories', 'id', `id TEXT NOT NULL, ${payload}`)}
${table('reserves', 'id', `id TEXT NOT NULL, account_id TEXT NOT NULL, ${payload}`, [account])}
${table('origins', 'id', 'id TEXT NOT NULL, account_id TEXT, reserve_id TEXT', [account, reserve, 'CHECK((account_id IS NULL)!=(reserve_id IS NULL))', "CHECK(id=coalesce('a:'||account_id,'r:'||reserve_id))"])}
${table('base_lines', 'id', `id TEXT NOT NULL,${catalogKeys}, plan INTEGER CHECK(plan ${money}), ${payload}`, catalogRefs)}
${table('recurring', 'id', `id TEXT NOT NULL, account_id TEXT, reserve_id TEXT, amount INTEGER CHECK(amount ${money}), ${payload}`, [account, reserve])}
${table('months', 'period', "period TEXT NOT NULL CHECK(period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(period,6) BETWEEN '01' AND '12')")}
${table('lines', 'period,id', `period TEXT NOT NULL,id TEXT NOT NULL,removed INTEGER NOT NULL CHECK(removed IN(0,1)),${catalogKeys},plan INTEGER CHECK(plan ${money}),${payload}`, [month, ...catalogRefs])}
${table('initials', 'period,source', `period TEXT NOT NULL,source TEXT NOT NULL,amount INTEGER CHECK(amount ${money})`, [month, fk('source', 'origins', 'id')])}
${table('snapshots', 'period', `period TEXT NOT NULL,format INTEGER NOT NULL CHECK(format=1),${payload}`, [month])}
CREATE TRIGGER snapshot_no_replace BEFORE INSERT ON snapshots WHEN EXISTS(SELECT 1 FROM snapshots WHERE space_id=NEW.space_id AND period=NEW.period) BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
CREATE TRIGGER snapshot_immutable BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
CREATE TRIGGER snapshot_no_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
${table(
  'events',
  'period,id',
  `period TEXT NOT NULL,id TEXT NOT NULL,line_id TEXT, amount INTEGER NOT NULL CHECK(amount ${signed}),
 purchase_amount INTEGER CHECK(purchase_amount ${money}),corrects TEXT,replaced_by TEXT,${payload},author_id TEXT,
 ${jsonId('saving_parent', 'savingParentId')},${jsonId('transfer_id', 'saving.transferId')},${jsonId('reserve_id', 'saving.reserveId')},
 ${jsonId('line_account', 'line.accountId')},${jsonId('line_category', 'line.categoryId')},${jsonId('line_reserve', 'line.reserveId')}`,
  [
    month,
    line,
    event('corrects'),
    event('replaced_by'),
    event('saving_parent'),
    event('transfer_id'),
    reserve,
    fk('line_account', 'accounts', 'id'),
    fk('line_category', 'categories', 'id'),
    fk('line_reserve', 'reserves', 'id'),
    fk('author_id', 'memberships', 'user_id'),
  ],
)}
${table('effects', 'period,event_id,source', `period TEXT NOT NULL,event_id TEXT NOT NULL,source TEXT NOT NULL,delta INTEGER NOT NULL CHECK(delta ${signed})`, [event('event_id'), fk('period,source', 'initials')])}
${table('allocations', 'period,event_id,parent_id', `period TEXT NOT NULL,event_id TEXT NOT NULL,parent_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991)`, [event('event_id'), event('parent_id')])}
${table('observations', 'period,event_id', `period TEXT NOT NULL,event_id TEXT NOT NULL,source TEXT,observed INTEGER NOT NULL CHECK(observed ${money}),calculated INTEGER NOT NULL CHECK(calculated ${signed}),purchases INTEGER CHECK(purchases ${money})`, [event('event_id'), fk('source', 'origins', 'id')])}
${table('occurrences', 'period,id', `period TEXT NOT NULL,id TEXT NOT NULL,definition_id TEXT NOT NULL,line_id TEXT,amount INTEGER CHECK(amount ${money}),${payload},${jsonId('account_id', 'accountId')},${jsonId('reserve_id', 'reserveId')}`, [month, line, account, reserve, fk('definition_id', 'recurring', 'id')])}
${table('excel_imports', 'period', `period TEXT NOT NULL,${payload}`, [month])}
${table('legacy_receipts', 'scope,request_id', 'scope TEXT NOT NULL,request_id TEXT NOT NULL,canonical TEXT NOT NULL')}
${table(
  'receipts',
  'user_id,request_id',
  `user_id TEXT NOT NULL,request_id TEXT NOT NULL,period TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('pending','confirmed','closed')),
 fingerprint TEXT, version INTEGER NOT NULL DEFAULT 1, acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN(0,1))`,
  [owner],
)}
CREATE INDEX legacy_receipt_key ON legacy_receipts(space_id,request_id,scope);
CREATE INDEX receipt_inbox ON receipts(space_id,user_id,acknowledged,AddedAt);
CREATE TABLE legacy_assignment(id INTEGER PRIMARY KEY CHECK(id=1),space_id TEXT NOT NULL,user_id TEXT NOT NULL,source_hash TEXT NOT NULL,AddedAt TEXT NOT NULL DEFAULT ${timestamp},${owner}) STRICT;
`;

export class SpaceCreationConflict extends Error {}
export function createSpace(db, userId, name, requestId, now = Date.now()) {
  if (!db.isTransaction) throw new Error('Transação de criação necessária.');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const sharing = version >= 8;
  const prior = db
    .prepare(
      sharing
        ? `SELECT s.id,s.name,s.currency,
          (SELECT role FROM memberships WHERE space_id=s.id AND user_id=c.creator_id AND IsDeleted=0
            AND s.IsDeleted=0) AS role
          FROM space_creations c JOIN spaces s ON s.id=c.space_id
          WHERE c.creator_id=? AND c.request_id=?`
        : 'SELECT id,name,currency FROM spaces WHERE owner_id=? AND creation_key=? AND IsDeleted=0',
    )
    .get(userId, requestId);
  if (prior) {
    const expired =
      version >= 9 && db.prepare('SELECT 1 FROM spaces WHERE id=? AND delete_due<=?').get(prior.id, now);
    if (expired || prior.role === null || prior.name !== name)
      throw new SpaceCreationConflict('A referência já foi utilizada.');
    return prior;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO spaces(id,owner_id,name,creation_key) VALUES(?,?,?,?)').run(
    id,
    userId,
    name,
    sharing ? id : requestId,
  );
  db.prepare('INSERT INTO memberships(space_id,user_id) VALUES(?,?)').run(id, userId);
  db.prepare('INSERT INTO meta(space_id) VALUES(?)').run(id);
  if (sharing) {
    db.prepare('INSERT INTO space_creations VALUES(?,?,?)').run(userId, requestId, id);
    return { id, name, currency: 'EUR', role: 'owner' };
  }
  return { id, name, currency: 'EUR' };
}
