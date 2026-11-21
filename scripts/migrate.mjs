import { fileURLToPath } from 'node:url';
import { databasePath, migrate } from '../src/server/storage.mjs';
import { lockDatabase } from './instance-lock.mjs';
import { allowTransition, testTransitionAuthorized } from '../src/server/transition.mjs';
import { privatePath } from '../src/server/local-files.mjs';
process.env.OMEUMES_PROJECT_ROOT=fileURLToPath(new URL('../',import.meta.url));
let lock;
try{const path=privatePath(databasePath());allowTransition(path,testTransitionAuthorized());lock=lockDatabase(path);const info=migrate(path,undefined,testTransitionAuthorized());console.log(`SQLite ${info.sqlite}: esquema ${info.version} preparado.`);}
catch(e){console.error('Não foi possível preparar a base local.');console.error(e.message);process.exitCode=1;}
finally{lock?.close();}
