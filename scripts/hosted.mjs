import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { hostedSettings } from '../src/server/hosted-config.mjs';
import {
  checkHostedDatabase,
  initializeHostedDatabase,
  prepareHostedDatabase,
} from '../src/server/hosted-database.mjs';
import { currentSchema } from '../src/server/transition.mjs';
import { createBackup } from '../src/server/local-files.mjs';
import { lockDatabase } from './instance-lock.mjs';
import { startBackgroundJobs } from '../src/server/background-jobs.mjs';

const [action, ...args] = process.argv.slice(2);
if (action === 'schema') {
  console.log(currentSchema);
  process.exit(0);
}
process.umask(0o077);
process.env.OMEUMES_PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
process.chdir(process.env.OMEUMES_PROJECT_ROOT);
let lock;
try {
  if (args.length || !['init', 'prepare', 'check', 'backup', 'start'].includes(action))
    throw new Error('Use hosted.mjs init|prepare|check|backup|start|schema.');
  const { path, config } = hostedSettings();
  // check is also used by a second process (Docker healthcheck).
  if (action !== 'check') lock = lockDatabase(path);
  if (action === 'init') initializeHostedDatabase();
  if (action === 'prepare') prepareHostedDatabase();
  if (action === 'check' || action === 'start' || action === 'backup') checkHostedDatabase(path);
  if (action === 'backup') console.log((await createBackup(path)).path);
  if (action !== 'start') {
    lock?.close();
    process.exit(0);
  }
  if (!existsSync(join(process.cwd(), '.next', 'BUILD_ID'))) throw new Error('Imagem sem compilação.');
  const jobs = startBackgroundJobs(path, config);
  const child = spawn(
    process.execPath,
    [
      '--import',
      new URL('./instance-lock.mjs', import.meta.url).href,
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '0.0.0.0',
      '--port',
      '3000',
    ],
    { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true },
  );
  let stopping = false;
  const health = createServer(async (request, response) => {
    try {
      if (request.url !== '/ready' || stopping || child.exitCode !== null || !jobs.healthy())
        throw new Error();
      checkHostedDatabase(path);
      const page = await fetch('http://127.0.0.1:3000/api/identity', {
        headers: { host: new URL(config.origin).host },
        signal: AbortSignal.timeout(3000),
      });
      if (!page.ok) throw new Error();
      response.writeHead(200, { 'Cache-Control': 'no-store' }).end('ready\n');
    } catch {
      response.writeHead(503, { 'Cache-Control': 'no-store' }).end('unavailable\n');
    }
  });
  health.listen(3001, '127.0.0.1');
  async function stop(signal) {
    if (stopping) return;
    stopping = true;
    health.close();
    const exit = new Promise((resolve) => child.once('exit', resolve));
    child.kill(signal);
    const force = setTimeout(() => child.kill('SIGKILL'), 20_000);
    force.unref();
    await jobs.stop();
    if (child.exitCode === null && child.signalCode === null) await exit;
    clearTimeout(force);
    lock?.close();
    process.exit(signal ? 0 : 1);
  }
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
  child.once('error', () => void stop());
  child.once('exit', () => {
    if (!stopping) void stop();
  });
} catch (error) {
  lock?.close();
  console.error('Arranque alojado recusado:', error.message);
  process.exitCode = 1;
}
