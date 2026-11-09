import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import exampleCatalog from '../data/catalog.json' with {type:'json'};

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
`CREATE TABLE excel_imports(period TEXT PRIMARY KEY REFERENCES months(period), payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;`
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
    db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    const value=p=>Object.values(db.prepare(`PRAGMA ${p}`).get())[0];
    if(value('application_id')!==APP_ID||value('user_version')<1||value('user_version')>migrations.length)throw new Error('Incompatible database schema');
    if(value('foreign_keys')!==1||value('synchronous')!==2||value('journal_mode')!=='wal')throw new Error('SQLite guarantees unavailable');
    return db;
  }catch(e){db.close();throw e;}
}

export function migrate(path,steps=migrations){
  mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path,{timeout:1500});
  try{
    db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    const val=p=>Object.values(db.prepare(`PRAGMA ${p}`).get())[0];
    const version=val('user_version'),app=val('application_id');
    const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if((app!==0&&app!==APP_ID)||(app===0&&(version!==0||tables.length))||version>steps.length)throw new Error('Incompatible database schema');
    db.exec('PRAGMA journal_mode=WAL; BEGIN IMMEDIATE;');
    try{
      // Re-read inside the lock: concurrent starters must never reapply a migration.
      const lockedVersion=val('user_version');
      for(let i=lockedVersion;i<steps.length;i++){db.exec(steps[i]);db.exec(`PRAGMA user_version=${i+1}`);}
      db.exec(`PRAGMA application_id=${APP_ID};`);
      if(lockedVersion===0&&!db.prepare('SELECT id FROM accounts LIMIT 1').get()){
        const localCatalog=resolve(dirname(path),'catalog.local.json');
        const catalog=existsSync(localCatalog)?JSON.parse(readFileSync(localCatalog,'utf8')):exampleCatalog;
        for(const a of catalog.accounts){db.prepare('INSERT INTO accounts VALUES(?,?)').run(a.id,JSON.stringify(a));db.prepare('INSERT INTO origins VALUES(?,?,NULL)').run(`a:${a.id}`,a.id);}
        for(const c of catalog.categories)db.prepare('INSERT INTO categories VALUES(?,?)').run(c.id,JSON.stringify(c));
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit'}).formatToParts(new Date());
        const period=`${parts.find(x=>x.type==='year').value}-${parts.find(x=>x.type==='month').value}`;
        db.prepare('INSERT INTO months VALUES(?)').run(period);
        for(const a of catalog.accounts)db.prepare('INSERT INTO initials VALUES(?,?,NULL)').run(period,`a:${a.id}`);
      }
      const requiredTables=['meta','accounts','categories','reserves','origins','base_lines','recurring','months','lines','initials','snapshots','events','effects','allocations','observations','occurrences','receipts'];
      if(steps.length>=3)requiredTables.push('excel_imports');
      for(const table of requiredTables){
        db.prepare(`SELECT * FROM ${table} LIMIT 0`).all();
      }
      if(db.prepare('SELECT format FROM meta WHERE id=1').get()?.format!==1)throw new Error('Incompatible database format');
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Invalid database references');
      if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Invalid database integrity');
      db.exec('COMMIT;');
    }catch(e){db.exec('ROLLBACK');throw e;}
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Invalid database references');
    return {sqlite:db.prepare('SELECT sqlite_version() AS version').get().version,version:val('user_version')};
  }finally{db.close();}
}
