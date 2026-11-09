import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(process.env.LOCALAPPDATA, 'O-meu-mes-rede');
const log = join(directory, 'arranque.log');
if (existsSync(join(directory, 'parar'))) process.exit(0);
let descriptor;
try {
  descriptor = openSync(log, 'a');
  const child = spawn(process.execPath, ['--import', new URL('./instance-lock.mjs', import.meta.url).href,
    fileURLToPath(new URL('./start-home.mjs', import.meta.url))], {
    cwd:root, stdio:['ignore',descriptor,descriptor,'ipc'], windowsHide:true,
  });
  const supervisor = process.ppid;
  const watchParent = setInterval(() => {
    try { process.kill(supervisor, 0); }
    catch {
      clearInterval(watchParent);
      if (child.connected) child.disconnect();
    }
  }, 1000);
  watchParent.unref();
  child.on('error', () => { process.exitCode=1; });
  child.on('exit', code => { clearInterval(watchParent);process.exitCode=code??1;closeSync(descriptor);descriptor=undefined; });
} catch (error) {
  // Keep the launcher log free of environment and request data.
  appendFileSync(log, `Não foi possível iniciar o ensaio doméstico (${error.code ?? error.name}).\n`);
  if (descriptor !== undefined) closeSync(descriptor);
  process.exitCode=1;
}
