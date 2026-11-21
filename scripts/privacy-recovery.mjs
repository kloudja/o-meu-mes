import { connect,migrate,migrations } from '../src/server/storage.mjs';
import { privatePath } from '../src/server/local-files.mjs';
import { settings } from '../src/modules/identity/policy.mjs';
import { provisionRegistry,reconcile } from '../src/server/recovery-registry.mjs';
import { lockDatabase } from './instance-lock.mjs';
const [action,candidate]=process.argv.slice(2);
if(!['provision','reconcile'].includes(action)||!candidate)throw new Error('Indique provision ou reconcile e o caminho absoluto da base offline.');
const path=privatePath(candidate);
const config=settings();
const lock=lockDatabase(path);
try{
 if(action==='reconcile')migrate(path,migrations,false,true);
 const db=connect(path);
 try{if(action==='provision')provisionRegistry(db,path);else reconcile(db,path,config.key);}
 finally{db.close();}
 console.log(action==='provision'?'Registo de recuperação protegido preparado.':'Reconciliação concluída. Cópia autorizada para arranque.');
}finally{lock.close();}
