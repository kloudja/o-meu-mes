// Arranque local, sem telemetria. Nunca termina processos de outras aplicações.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { databasePath, migrate } from '../src/server/storage.mjs';
import { privatePath } from '../src/server/local-files.mjs';
import { lockDatabase } from './instance-lock.mjs';
let lock;
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
process.env.OMEUMES_PROJECT_ROOT=projectRoot;
process.chdir(projectRoot);
const mode=process.argv[2]??'dev';
if(!['dev','start','build'].includes(mode))throw new Error('Comando inválido.');
const args=[mode];
if(mode!=='build'){
  const baseIndex=process.argv.indexOf('--base');
  const recovery=baseIndex>=0;
  let path;
  try {
    if(recovery){
      const candidate=process.argv[baseIndex+1];
      if(!candidate||candidate.startsWith('--'))throw new Error('Indique o caminho completo da cópia depois de --base.');
      path=privatePath(candidate);
      if(!existsSync(path))throw new Error('A cópia indicada não existe. Verifique o caminho ou abra Restaurar.cmd.');
      process.env.OMEUMES_DB_PATH=path;
      process.env.OMEUMES_RECOVERY_SCOPE=createHash('sha256').update(path).digest('hex');
    } else path=privatePath(databasePath());
    lock=lockDatabase(path);
    const info=migrate(path);
    console.log(`SQLite ${info.sqlite}: esquema ${info.version} preparado.`);
  } catch(e) {
    console.error(`Não foi possível abrir ou preparar a base: ${path??process.env.OMEUMES_DB_PATH??'caminho habitual'}`);
    console.error('Confirme o caminho, a versão e a permissão de escrita na pasta. Se precisar de recuperar dados, abra Restaurar.cmd.');
    console.error(`Diagnóstico: ${e.code??e.message}`);
    process.exit(1);
  }
  const portIndex=process.argv.indexOf('--port');
  let port=portIndex<0?(recovery?3100:3000):Number(process.argv[portIndex+1]);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Porta inválida.');
  const first=port;
  const free=p=>new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(p,'127.0.0.1',()=>server.close(()=>resolve(true)));});
  while(!(await free(port))){port++;if(port>Math.min(first+20,65535))throw new Error('Sem porta livre. Escolha outra com --port.');}
  if(port!==first)console.log(`Porta ${first} ocupada. A utilizar a porta ${port}.`);
  console.log(`${recovery?'Cópia recuperada':'Base local'}: ${path}`);
  console.log(`Abra http://127.0.0.1:${port} no navegador.`);
  args.push('--hostname','127.0.0.1','--port',String(port));
}
const child=spawn(process.execPath,['--import',new URL('./instance-lock.mjs',import.meta.url).href,fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),...args],{stdio:['inherit','inherit','inherit','ipc'],windowsHide:true,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{lock?.close();process.exitCode=code??1;});
