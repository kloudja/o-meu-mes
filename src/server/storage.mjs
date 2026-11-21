import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { allowTransition } from './transition.mjs';
import { spaceSchema } from '../modules/spaces/schema.mjs';
import { mu3Schema } from '../modules/spaces/schema-mu3.mjs';
import { mu4Schema } from '../modules/spaces/schema-mu4.mjs';
import { mu5Schema } from '../modules/privacy/schema.mjs';
import { guardRegistry } from './recovery-registry.mjs';
import { identitySchema } from '../modules/identity/schema.mjs';

export const APP_ID=1330464083;
const safe='BETWEEN -9007199254740991 AND 9007199254740991';
const positive='BETWEEN 0 AND 9007199254740991';
export const migrations=[
`CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0), format INTEGER NOT NULL CHECK(format=1)) STRICT;
INSERT INTO meta VALUES(1,0,1);
CREATE TABLE accounts(id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE categories(id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE reserves(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE origins(id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id), reserve_id TEXT REFERENCES reserves(id), CHECK((account_id IS NULL)!=(reserve_id IS NULL))) STRICT;
CREATE TABLE base_lines(id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id), category_id TEXT REFERENCES categories(id), reserve_id TEXT REFERENCES reserves(id), plan INTEGER CHECK(plan ${positive}), payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE recurring(id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id), reserve_id TEXT REFERENCES reserves(id), amount INTEGER CHECK(amount ${positive}), payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE months(period TEXT PRIMARY KEY CHECK(length(period)=7)) STRICT;
CREATE TABLE lines(period TEXT NOT NULL REFERENCES months(period), id TEXT NOT NULL, removed INTEGER NOT NULL CHECK(removed IN(0,1)), account_id TEXT REFERENCES accounts(id), category_id TEXT REFERENCES categories(id), reserve_id TEXT REFERENCES reserves(id), plan INTEGER CHECK(plan ${positive}), payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(period,id)) STRICT;
CREATE TABLE initials(period TEXT NOT NULL REFERENCES months(period), source TEXT NOT NULL REFERENCES origins(id), amount INTEGER CHECK(amount ${positive}), PRIMARY KEY(period,source)) STRICT;
CREATE TABLE snapshots(period TEXT PRIMARY KEY REFERENCES months(period), format INTEGER NOT NULL CHECK(format=1), payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TRIGGER snapshot_immutable BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
CREATE TRIGGER snapshot_no_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
CREATE TABLE events(period TEXT NOT NULL REFERENCES months(period), id TEXT NOT NULL, line_id TEXT, amount INTEGER NOT NULL CHECK(amount ${safe}), purchase_amount INTEGER CHECK(purchase_amount ${positive}), corrects TEXT, replaced_by TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(period,id), FOREIGN KEY(period,line_id) REFERENCES lines(period,id), FOREIGN KEY(period,corrects) REFERENCES events(period,id) DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY(period,replaced_by) REFERENCES events(period,id) DEFERRABLE INITIALLY DEFERRED) STRICT;
CREATE TABLE effects(period TEXT NOT NULL, event_id TEXT NOT NULL, source TEXT NOT NULL, delta INTEGER NOT NULL CHECK(delta ${safe}), PRIMARY KEY(period,event_id,source), FOREIGN KEY(period,event_id) REFERENCES events(period,id), FOREIGN KEY(period,source) REFERENCES initials(period,source)) STRICT;
CREATE TABLE allocations(period TEXT NOT NULL, event_id TEXT NOT NULL, parent_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991), PRIMARY KEY(period,event_id,parent_id), FOREIGN KEY(period,event_id) REFERENCES events(period,id), FOREIGN KEY(period,parent_id) REFERENCES events(period,id)) STRICT;
CREATE TABLE observations(period TEXT NOT NULL, event_id TEXT NOT NULL, source TEXT REFERENCES origins(id), observed INTEGER NOT NULL CHECK(observed ${positive}), calculated INTEGER NOT NULL CHECK(calculated ${safe}), purchases INTEGER CHECK(purchases ${positive}), PRIMARY KEY(period,event_id), FOREIGN KEY(period,event_id) REFERENCES events(period,id)) STRICT;
CREATE TABLE occurrences(period TEXT NOT NULL REFERENCES months(period), id TEXT NOT NULL, definition_id TEXT NOT NULL REFERENCES recurring(id), line_id TEXT, amount INTEGER CHECK(amount ${positive}), payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(period,id), FOREIGN KEY(period,line_id) REFERENCES lines(period,id)) STRICT;
CREATE TABLE receipts(scope TEXT NOT NULL, request_id TEXT NOT NULL, canonical TEXT NOT NULL, PRIMARY KEY(scope,request_id)) STRICT;`,
`CREATE INDEX effects_source ON effects(period,source);
CREATE INDEX events_line ON events(period,line_id);
CREATE INDEX allocations_parent ON allocations(period,parent_id);
CREATE INDEX occurrences_definition ON occurrences(definition_id,period);`,
`CREATE TABLE excel_imports(period TEXT PRIMARY KEY REFERENCES months(period), payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;`,
`INSERT INTO base_lines (id, account_id, category_id, reserve_id, plan, payload)
SELECT 'monthly-income:' || id, id, NULL, NULL, json_extract(payload, '$.baseInitial'),
  json_object('id', 'monthly-income:' || id, 'name', 'Receita mensal · ' || json_extract(payload, '$.name'),
    'kind', 'income', 'accountId', id, 'categoryId', '')
FROM accounts WHERE json_type(payload, '$.baseInitial') = 'integer' AND json_extract(payload, '$.baseInitial') > 0;
UPDATE accounts SET payload = json_remove(payload, '$.baseInitial') WHERE json_type(payload, '$.baseInitial') IS NOT NULL;
UPDATE meta SET revision = revision + 1 WHERE id = 1 AND changes() > 0;`,
identitySchema, spaceSchema, mu3Schema, mu4Schema, mu5Schema
];

export function databasePath(){
  const root=process.env.OMEUMES_PROJECT_ROOT||process.cwd();
  const configured=process.env.OMEUMES_DB_PATH;
  if(configured&&!isAbsolute(configured))throw new Error('OMEUMES_DB_PATH must be absolute');
  const path=configured||resolve(root,'data/o-meu-mes.sqlite');
  if(process.env.OMEUMES_TEST_MODE==='1'&&!/[\\/]omeumes-test-[^\\/]+[\\/]/.test(path))throw new Error('Test database must be in an omeumes-test-* directory');
  if(resolve(/* turbopackIgnore: true */ path).replaceAll('\\','/').toLowerCase().includes('/public/'))throw new Error('Database cannot be public');
  return path;
}

export function connect(path,timeout=1500){
  if(!existsSync(path))throw new Error('Database unavailable; use the migration/start script');
  const db=new DatabaseSync(path,{timeout,enableForeignKeyConstraints:true,enableDoubleQuotedStringLiterals:false});
  try{
    db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
    const value=p=>Object.values(db.prepare(`PRAGMA ${p}`).get())[0];
    if(value('application_id')!==APP_ID||value('user_version')<1||value('user_version')>migrations.length)throw new Error('Incompatible database schema');
    if(value('foreign_keys')!==1||value('synchronous')!==2||value('journal_mode')!=='wal')throw new Error('SQLite guarantees unavailable');
    if(value('user_version')>=9)guardRegistry(db,path);
    return db;
  }catch(e){db.close();throw e;}
}

export function migrate(path,steps=migrations,authorized=false,recovery=false){
  allowTransition(path,authorized,steps.length,recovery);
  mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path,{timeout:1500});
  try{
    db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
    const val=p=>Object.values(db.prepare(`PRAGMA ${p}`).get())[0];
    const version=val('user_version'),app=val('application_id');
    const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if((app!==0&&app!==APP_ID)||(app===0&&(version!==0||tables.length))||version>steps.length)throw new Error('Incompatible database schema');
    // SQLite requires foreign keys suspended while rebuilding a referenced table.
    // The whole migration still checks every reference before committing.
    if(version<steps.length&&steps.length>=7)db.exec('PRAGMA foreign_keys=OFF;');
    db.exec('PRAGMA journal_mode=WAL; BEGIN IMMEDIATE;');
    try{
      // Re-read inside the lock: concurrent starters must never reapply a migration.
      const lockedVersion=val('user_version');
      if(lockedVersion>0 && lockedVersion<6 && steps.length>=6)throw new Error('A origem financeira exige uma atribuição explícita num destino distinto.');
      if(lockedVersion===6&&steps.length>=7&&!authorized)throw new Error('Transição MU3 por autorizar.');
      if(lockedVersion===7&&steps.length>=8&&!authorized)throw new Error('Transição MU4 por autorizar.');
      if(lockedVersion===8&&steps.length>=9&&!authorized)throw new Error('Transição MU5 por autorizar.');
      for(let i=lockedVersion;i<steps.length;i++){db.exec(steps[i]);db.exec(`PRAGMA user_version=${i+1}`);}
      db.exec(`PRAGMA application_id=${APP_ID};`);
      const requiredTables=['meta','accounts','categories','reserves','origins','base_lines','recurring','months','lines','initials','snapshots','events','effects','allocations','observations','occurrences','receipts'];
      if(steps.length>=3)requiredTables.push('excel_imports');
      if(steps.length>=5)requiredTables.push('identity_control','users','credentials','documents','acceptances','sessions','recovery_codes','challenges','mail_jobs','auth_limits');
      if(steps.length>=6)requiredTables.push('spaces','memberships','legacy_assignment','legacy_receipts');
      if(steps.length>=7)requiredTables.push('finance_versions');
      if(steps.length>=8)requiredTables.push('space_creations','space_invites','ownership_transfers');
      for(const table of requiredTables){
        db.prepare(`SELECT * FROM ${table} LIMIT 0`).all();
      }
      if(steps.length<6&&db.prepare('SELECT format FROM meta WHERE id=1').get()?.format!==1)throw new Error('Incompatible database format');
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Invalid database references');
      if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Invalid database integrity');
      db.exec('COMMIT;');
    }catch(e){db.exec('ROLLBACK');throw e;}
    db.exec('PRAGMA foreign_keys=ON;');
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Invalid database references');
    return {sqlite:db.prepare('SELECT sqlite_version() AS version').get().version,version:val('user_version')};
  }finally{db.close();}
}
