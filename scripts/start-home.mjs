import { execFile, spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { migrate } from '../src/server/storage.mjs';
import { privatePath } from '../src/server/local-files.mjs';
import { seedTrial } from './trial-fixture.mjs';
import { lockDatabase } from './instance-lock.mjs';
import { homeEntry } from './home-entry.mjs';
import { inHomeSubnet, networkLease, sameHome } from './home-network.mjs';

if (process.platform !== 'win32') throw new Error('O modo doméstico está preparado para Windows.');
const root = fileURLToPath(new URL('../', import.meta.url));
const configDir = join(process.env.LOCALAPPDATA, 'O-meu-mes-rede');
const configPath = join(configDir, 'casa.json');
const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
const host = config.name || config.address;
if (!inHomeSubnet(config.address, config.gateway) || config.address === config.gateway ||
    (config.name && !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(config.name))) {
  throw new Error('Configuração de endereços domésticos inválida.');
}
const origin = `http://${host}:8443`;
const upstream = 3076;
const local = `http://127.0.0.1:${upstream}`;
const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const credentialPath = join(configDir, 'credencial.json');
const credential = existsSync(credentialPath) ? JSON.parse(readFileSync(credentialPath, 'utf8')) : undefined;
if (credential && (!/^[0-9a-f]{64}$/.test(credential.salt) || !/^[0-9a-f]{128}$/.test(credential.hash))) throw new Error('Credencial inválida.');
const proof = randomBytes(32).toString('hex');
const lease = networkLease(config);
const stopPath = join(configDir, 'parar');
const statusPath = join(configDir, 'estado.txt');
const launchMutex = createServer(socket => socket.destroy());
await new Promise((resolve, reject) => {
  launchMutex.once('error', reject);
  launchMutex.listen(upstream + 1, '127.0.0.1', resolve);
});
if (existsSync(stopPath)) {
  launchMutex.close();
  throw new Error('Arranque suspenso. Execute Rede.ps1 Start.');
}
const { server, invalidate } = homeEntry({ origin, upstream, proof, credential,
  allowed: ip => lease.live() && inHomeSubnet(config.address, ip) && !existsSync(stopPath),
  enabled: () => !!credential });
const directory = privatePath(join(root, 'data', 'ensaios', 'rede-domestica'));
const path = join(directory, 'ensaio-ficticio.sqlite');
const marker = join(directory, 'ensaio.json');
mkdirSync(directory, { recursive: true });
if (!existsSync(marker)) {
  if (existsSync(path)) throw new Error('Base sem identificação de ensaio.');
  writeFileSync(marker, '{"fixture":"rede-v1","prepared":false}', { flag: 'wx' });
}
const metadata = JSON.parse(readFileSync(marker, 'utf8'));
if (metadata.fixture !== 'rede-v1' || metadata.prepared && !existsSync(path)) throw new Error('Identificação ou base de ensaio inválida.');
if (!existsSync(join(root, '.next', 'BUILD_ID'))) throw new Error('Execute pnpm build antes de iniciar o ensaio.');
const lock = lockDatabase(path);
migrate(path);
const child = spawn(process.execPath, ['--import', new URL('./instance-lock.mjs', import.meta.url).href, 'node_modules/next/dist/bin/next',
  'start', '--hostname', '127.0.0.1', '--port', String(upstream)], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', OMEUMES_PROJECT_ROOT: root, OMEUMES_DB_PATH: path,
    OMEUMES_TRIAL: '1', OMEUMES_HOME_ORIGIN: origin, OMEUMES_HOME_ENTRY: proof,
    OMEUMES_RECOVERY_SCOPE: createHash('sha256').update(path).digest('hex') },
});
let stopped = false;
let status = '';
function show(value) {
  if (value === status) return;
  status = value;
  writeFileSync(statusPath, value + '\n');
  console.log(value);
}
async function unbind() {
  lease.revoke();
  invalidate();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
async function shutdown() {
  if (stopped) return;
  stopped = true;
  await unbind();
  if (child.connected) child.disconnect();
  await exited;
  lock.close();
  launchMutex.close();
  show('Ensaio parado.');
  // The supervisor's IPC channel must not keep this stopped process alive.
  process.channel?.unref();
}
const exited = new Promise(resolve => {
  child.once('exit', resolve);
  child.once('error', resolve);
});
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const supervisor = process.ppid;
function supervisorAlive() {
  try { process.kill(supervisor, 0); return true; } catch { return false; }
}
try {
  let ready = false;
  for (let i = 0; i < 100 && !stopped && child.exitCode === null; i++) {
    try {
      if ((await fetch(`${local}/api/state`, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; }
    } catch {}
    await sleep(100);
  }
  if (!ready) throw new Error('O servidor SQLite do ensaio não respondeu.');
  if (!metadata.prepared) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts();
    const year = parts.find(part => part.type === 'year').value;
    const month = parts.find(part => part.type === 'month').value;
    await seedTrial(local, `${year}-${month}`);
    writeFileSync(marker, '{"fixture":"rede-v1","prepared":true}');
  }
  while (!stopped && child.exitCode === null && !existsSync(stopPath) && supervisorAlive()) {
    if (!lease.live() && server.listening) await unbind();
    let observed;
    try {
      const { stdout } = await promisify(execFile)(powershell,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', join(root, 'Rede.ps1'), 'Probe'], { timeout: 9000, windowsHide: true });
      observed = JSON.parse(stdout);
    } catch {}
    if (stopped || existsSync(stopPath) || child.exitCode !== null) break;
    if (!config.networkName && typeof observed?.networkName === 'string' && observed.networkName &&
        sameHome({ ...config, networkName: observed.networkName }, observed)) {
      // Existing trial configurations gain this additional pin only after the original home checks pass.
      config.networkName = observed.networkName;
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    }
    // A probe older than the previous lease cannot preserve existing sessions.
    if (server.listening && !lease.live()) await unbind();
    if (!lease.renew(observed)) {
      await unbind();
      show(`Ensaio só neste PC: ${local}. Rede ou firewall doméstica por confirmar.`);
    } else if (!server.listening) {
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen({ port: 8443, host: config.address, ipv6Only: true }, () => {
            server.removeListener('error', reject);
            resolve();
          });
        });
        show(`Ensaio fictício: ${origin} · neste PC: ${local}`);
      } catch {
        show(`Ensaio só neste PC: ${local}. Não foi possível abrir a porta HTTP doméstica.`);
      }
    }
    await sleep(2500);
  }
} finally {
  await shutdown();
}
