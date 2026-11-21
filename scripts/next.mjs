// Arranque local, sem telemetria. Nunca termina processos de outras aplicações.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { connect,databasePath, migrate } from '../src/server/storage.mjs';
import { privatePath } from '../src/server/local-files.mjs';
import { readWindowsAuthKey } from './windows-auth-key.mjs';
import { databaseIsQuarantined } from '../src/server/local-files.mjs';
import { lockDatabase } from './instance-lock.mjs';
import { allowTransition, currentSchema, testTransitionAuthorized } from '../src/server/transition.mjs';
import { settings } from '../src/modules/identity/policy.mjs';
import { startBackgroundJobs } from '../src/server/background-jobs.mjs';
let lock;
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
process.env.OMEUMES_PROJECT_ROOT=projectRoot;
process.chdir(projectRoot);
const mode=process.argv[2];
if(mode!=='start'&&mode!=='build')throw new Error('Comando inválido.');
const args=[mode];
const nextCli=fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url));
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1'};
if(mode==='start'){
  const [option,candidate,...extra]=process.argv.slice(3);
  if(option&&(option!=='--base'||!candidate||candidate.startsWith('--')||extra.length)){
    console.error('Use Iniciar.cmd ou Iniciar.cmd --base seguido do caminho completo da cópia.');
    process.exit(1);
  }
  const recovery=option==='--base';
  const testing=process.env.OMEUMES_TEST_MODE==='1';
  const port=testing&&process.env.OMEUMES_TEST_PORT?Number(process.env.OMEUMES_TEST_PORT):3000;
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Porta inválida.');
  const free=await new Promise(resolve=>{
    const probe=createServer();
    probe.once('error',()=>resolve(false));
    probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));
  });
  if(!free){
    console.error(`Porta ${port} ocupada. Feche a instância atual antes de voltar a abrir O meu mês.`);
    process.exit(1);
  }
  let path;
  try {
    if(recovery){
      path=privatePath(candidate);
      if(!existsSync(path))throw new Error('A cópia indicada não existe. Verifique o caminho ou abra Restaurar.cmd.');
      env.OMEUMES_RECOVERY_SCOPE=createHash('sha256').update(path).digest('hex');
    } else path=privatePath(databasePath());
    allowTransition(path, testTransitionAuthorized(), currentSchema, recovery);
    if(recovery && !databaseIsQuarantined(path)){
      const db=connect(path);
      try{if(!db.prepare('SELECT 1 FROM privacy_control WHERE registered=1 AND released=1').get())throw new Error('A cópia de recuperação tem de estar em quarentena.');}
      finally{db.close();}
      delete env.OMEUMES_RECOVERY_SCOPE;
      env.OMEUMES_RELEASED_PATH=path;
    }
    if(!testing && !env.OMEUMES_AUTH_KEY)env.OMEUMES_AUTH_KEY=readWindowsAuthKey(join(projectRoot,'data','identity-key.dpapi'));
    const config=settings(env);
    lock=lockDatabase(path);
    env.OMEUMES_DB_PATH=path;
    if(!recovery)delete env.OMEUMES_RECOVERY_SCOPE;
    if(!testing)delete env.OMEUMES_BUILD_DIR;
    if(!testing||!existsSync(join(env.OMEUMES_BUILD_DIR||'.next','BUILD_ID'))){
      console.log('A compilar o código atual de O meu mês…');
      const build=spawnSync(process.execPath,[nextCli,'build'],{env,stdio:'inherit',windowsHide:true});
      if(build.status!==0){lock.close();process.exit(build.status??1);}
    }
    const info=migrate(path, undefined, testTransitionAuthorized(), recovery);
    console.log(`SQLite ${info.sqlite}: esquema ${info.version} preparado.`);
    if (!env.OMEUMES_RECOVERY_SCOPE) {
      startBackgroundJobs(path,config);
    }
  } catch(e) {
    lock?.close();
    console.error(`Não foi possível abrir ou preparar a base: ${path??process.env.OMEUMES_DB_PATH??'caminho habitual'}`);
    console.error('Confirme o caminho, a versão e a permissão de escrita na pasta. Se precisar de recuperar dados, abra Restaurar.cmd.');
    console.error(`Diagnóstico: ${e.code??e.message}`);
    process.exit(1);
  }
  console.log(`${recovery?'Cópia recuperada':'Base local'}: ${path}`);
  console.log(`Abra http://127.0.0.1:${port} no navegador.`);
  args.push('--hostname','127.0.0.1','--port',String(port));
}
const child=spawn(process.execPath,['--import',new URL('./instance-lock.mjs',import.meta.url).href,nextCli,...args],{stdio:['inherit','inherit','inherit','ipc'],windowsHide:true,env});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{lock?.close();process.exitCode=code??1;});
