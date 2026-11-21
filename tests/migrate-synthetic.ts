import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { connect, migrate, migrations } from '../src/server/storage.mjs';
// Reconstruct the former local bootstrap only for legacy regression fixtures.
export function migrateSynthetic(path:string,steps=migrations.slice(0,5)){
  const fresh=!existsSync(path);
  const info=migrate(path,steps,true);
  if(fresh && steps.length<6){
    const db=connect(path);
    try { db.exec('BEGIN IMMEDIATE');
        const localCatalog=resolve(dirname(path),'catalog.local.json');
        const catalog=existsSync(localCatalog)?JSON.parse(readFileSync(localCatalog,'utf8')):{accounts:[],categories:[]};
        for(const a of catalog.accounts){db.prepare('INSERT INTO accounts VALUES(?,?)').run(a.id,JSON.stringify(a));db.prepare('INSERT INTO origins VALUES(?,?,NULL)').run(`a:${a.id}`,a.id);}
        for(const c of catalog.categories)db.prepare('INSERT INTO categories VALUES(?,?)').run(c.id,JSON.stringify(c));
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit'}).formatToParts(new Date());
        const period=`${parts.find(x=>x.type==='year')!.value}-${parts.find(x=>x.type==='month')!.value}`;
        db.prepare('INSERT INTO months VALUES(?)').run(period);
        for(const a of catalog.accounts)db.prepare('INSERT INTO initials VALUES(?,?,NULL)').run(period,`a:${a.id}`);
      db.exec('COMMIT');
    } finally { db.close(); }
  }
  return info;
}
