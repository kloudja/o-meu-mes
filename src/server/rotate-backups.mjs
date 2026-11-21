import { existsSync,lstatSync,opendirSync,realpathSync,unlinkSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { retention } from '../modules/privacy/lifecycle.mjs';
// Only autonomous files in the managed backup namespace. Never follow links or rotate another directory.
export function rotateBackups(path,now){
 const folder=join(dirname(path),'backups');
 if(!existsSync(folder))return 0;
 if(realpathSync(folder)!==resolve(folder))throw new Error('Pasta de backups inesperada.');
 const cutoff=new Date(now-retention().backups).toISOString().replaceAll(':','-');
 const dir=opendirSync(folder);
 let removed=0;
 try{
   for(let entry;(entry=dir.readSync())!==null && removed<16;){
     const match=/^o-meu-mes-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z)-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\.sqlite$/i.exec(entry.name);
     if(!entry.isFile()||!match||match[1]>cutoff)continue;
     const file=join(folder,entry.name);
     if(lstatSync(file).nlink!==1 || path===file)continue;
     unlinkSync(file);removed++;
   }
 }finally{dir.closeSync();}
 return removed;
}
