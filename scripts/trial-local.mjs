import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/server/storage.mjs';
import { privatePath } from '../src/server/local-files.mjs';
import { lockDatabase } from './instance-lock.mjs';
import { seedTrial, trialPeriod } from './trial-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const buildDir = '.next-fase-6-ajustes';
const directory = privatePath(join(root, 'data', 'ensaios', 'fase-6-ajustes'));
const database = join(directory, 'ensaio-ficticio.sqlite');
const marker = join(directory, 'ensaio.json');
const url = 'http://127.0.0.1:3072';
const fixture = 'fase-6-ajustes';
if (!existsSync(join(root, buildDir, 'BUILD_ID'))) {
  throw new Error('Compile primeiro com OMEUMES_BUILD_DIR=.next-fase-6-ajustes e pnpm build.');
}

const lock = lockDatabase(database);
try {
  if (!existsSync(marker)) {
    if (existsSync(database)) throw new Error('A base existente não está identificada como ensaio.');
    writeFileSync(marker, JSON.stringify({fixture,prepared:false}), { flag: 'wx' });
  }
  const state = JSON.parse(readFileSync(marker, 'utf8'));
  if (state.fixture !== fixture || typeof state.prepared !== 'boolean' ||
    state.prepared && !existsSync(database)) throw new Error('Identificação ou base de ensaio inválida.');
  migrate(database);
  const child = spawn(process.execPath, ['--import', new URL('./instance-lock.mjs', import.meta.url).href,
    'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3072'], {
    cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true,
    env: { ...process.env, OMEUMES_PROJECT_ROOT: root, OMEUMES_DB_PATH: database, OMEUMES_BUILD_DIR: buildDir,
      OMEUMES_TRIAL: '1', OMEUMES_LOCAL_TRIAL_DEMO: '1', OMEUMES_TEST_MODE: '0', NEXT_TELEMETRY_DISABLED: '1' },
  });
  const stopped = new Promise(resolve => {
    child.once('exit', resolve);
    child.once('error', () => resolve(1));
  });
  const stop = () => { if (child.connected) child.disconnect(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80 && child.connected; attempt++) {
      try {
        // Confirm the fixture server owns the port before sending any writes.
        const response = await fetch(url, { signal: AbortSignal.timeout(800) });
        if (response.ok && (await response.text()).includes('O meu mês · Ensaio fictício') &&
          (await fetch(url + '/demo', { signal: AbortSignal.timeout(800) })).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!ready || !child.connected) throw new Error('Não foi possível abrir o ensaio local na porta 3072.');
    if (!state.prepared) {
      await seedTrial(url, trialPeriod, true);
      writeFileSync(marker, JSON.stringify({fixture,prepared:true}));
    }
    console.log(`Ensaio fictício: ${url} · Demonstração: ${url}/demo`);
    process.exitCode = Number(await stopped ?? 0);
  } finally {
    stop();
    await stopped;
  }
} finally {
  lock.close();
}
