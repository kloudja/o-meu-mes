import { fileURLToPath } from 'node:url';
import { databasePath, migrate } from '../src/server/storage.mjs';
import { lockDatabase } from './instance-lock.mjs';
import { privatePath } from '../src/server/local-files.mjs';
process.env.OMEUMES_PROJECT_ROOT=fileURLToPath(new URL('../',import.meta.url));
let lock;
try{const path=privatePath(databasePath());lock=lockDatabase(path);const info=migrate(path);console.log(`SQLite ${info.sqlite}: esquema ${info.version} preparado.`);}
catch(e){console.error('Não foi possível preparar a base local. Verifique configuração, permissões e compatibilidade do esquema. A base não foi reposta.');console.error(`Diagnóstico: ${e.code||e.name}`);process.exitCode=1;}
finally{lock?.close();}
