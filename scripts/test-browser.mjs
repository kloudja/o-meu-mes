// Every browser suite gets a new, clearly identified database. No user database is opened.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { migrate } from '../src/server/storage.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const directory=mkdtempSync(join(tmpdir(),'omeumes-test-browser-')),path=join(directory,'browser.sqlite');migrate(path);
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const url=`http://127.0.0.1:${port}`;
const env={...process.env,OMEUMES_PROJECT_ROOT:root,OMEUMES_DB_PATH:path,OMEUMES_TRIAL:'1',OMEUMES_TEST_MODE:'1',NEXT_TELEMETRY_DISABLED:'1',PLAYWRIGHT_BASE_URL:url,OMEUMES_E2E_ISOLATED:'1'};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:'inherit',windowsHide:true});
console.log(`Base de testes isolada: ${directory}`);
try{
  let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(`${url}/api/state`);if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  if(!ready)throw new Error('Servidor de teste indisponível.');
  const suite=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],{cwd:root,env,stdio:'inherit',windowsHide:true});
  process.exitCode=await new Promise(resolve=>suite.on('exit',code=>resolve(code??1)));
}finally{server.kill();await new Promise(resolve=>server.on('exit',resolve));}
