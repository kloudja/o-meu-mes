// Runs only in Linux CI. All storage and credentials are synthetic and disposable.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { requestLoopback } from '../../scripts/hosted-http.mjs';

assert.equal(process.platform, 'linux');
const image = process.argv[2];
assert.match(image || '', /^omeumes:[0-9a-f]{40}$/);
const root = mkdtempSync(join(tmpdir(), 'omeumes-test-image-'));
const data = join(root, 'state');
for (const path of [data, join(data, 'database'), join(data, 'authority')]) {
  mkdirSync(path);
  chmodSync(path, 0o777); // test-only: GitHub runner and image have different UIDs
}
const envPath = join(root, 'synthetic.env');
writeFileSync(
  envPath,
  [
    'OMEUMES_DATA_ROOT=/state',
    'OMEUMES_DB_PATH=/state/database/app.sqlite',
    'OMEUMES_RECOVERY_REGISTRY=/state/authority/recovery.sqlite',
    'OMEUMES_AUTH_ORIGIN=https://omeumes.example.invalid',
    'OMEUMES_MAIL_TRANSPORT=brevo',
    'OMEUMES_AUTH_KEY=' + randomBytes(32).toString('base64'),
    'OMEUMES_RECOVERY_KEY=' + randomBytes(32).toString('base64'),
    'BREVO_API_KEY=synthetic-never-sent',
    'BREVO_SENDER=sender@example.invalid',
  ].join('\n'),
  { mode: 0o600 },
);
const mounts = ['--env-file', envPath, '-v', data + ':/state'];
const containers = [];
const docker = (args, input) =>
  execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const once = (...args) => docker(['run', '--rm', ...mounts, image, 'node', 'scripts/hosted.mjs', ...args]);
async function start() {
  const id = docker([
    'run',
    '-d',
    '--init',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=128m,uid=1000,gid=1000,mode=1770',
    '--tmpfs',
    '/app/.next/cache:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700',
    ...mounts,
    '-p',
    '127.0.0.1::3000',
    image,
  ]);
  containers.push(id);
  let lastCheck;
  for (let i = 0; i < 60; i++) {
    const check = spawnSync('docker', ['exec', id, 'node', 'scripts/healthcheck.mjs'], {
      encoding: 'utf8',
      timeout: 12_000,
    });
    if (check.status === 0) {
      const port = docker(['port', id, '3000/tcp']).split(':').at(-1);
      return { id, port };
    }
    lastCheck = check.error?.message || check.stderr || check.stdout || 'exit ' + check.status;
    await delay(1000);
  }
  throw new Error('Image not ready: ' + lastCheck.trim() + '\n' + docker(['logs', id]));
}
let person;
async function request(app, path, payload) {
  const response = await requestLoopback(app.port, path, {
    method: payload ? 'POST' : 'GET',
    headers: {
      Host: 'omeumes.example.invalid',
      Origin: 'https://omeumes.example.invalid',
      'Content-Type': 'application/json',
      ...(person ? { Cookie: '__Host-omeumes=' + person.cookie, 'X-Account': person.id } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    timeout: 10_000,
  });
  assert.equal(response.status, 200, response.body);
  return JSON.parse(response.body);
}
try {
  assert.notEqual(
    spawnSync('docker', ['run', '--rm', ...mounts, image, 'node', 'scripts/hosted.mjs', 'prepare']).status,
    0,
  );
  once('init');
  assert.notEqual(
    spawnSync('docker', ['run', '--rm', ...mounts, image, 'node', 'scripts/hosted.mjs', 'init']).status,
    0,
  );
  let app = await start();
  person = JSON.parse(
    docker(
      ['exec', '-i', app.id, 'node', '--input-type=module'],
      `
    import {randomBytes,randomUUID} from 'node:crypto';
    import {hashSync,verifySync} from '@node-rs/argon2';
    import {connect,databasePath} from './src/server/storage.mjs';
    import {digest} from './src/modules/identity/secrets.mjs';
    const db=connect(databasePath()),id=randomUUID(),cookie=randomBytes(32).toString('base64url'),now=Date.now();
    const hash=hashSync(randomBytes(32).toString('base64'));
    if(!hash.startsWith('$argon2id$')||verifySync(hash,'wrong'))throw new Error('Native Argon2 failed');
    db.exec('BEGIN IMMEDIATE');
    if(db.prepare('SELECT count(*) AS n FROM users').get().n!==0)throw new Error('Not empty');
    db.prepare("INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created) VALUES(?,'Ana','Sintética','ana@example.invalid',1,'PT',?,?)").run(id,now,now);
    db.prepare('INSERT INTO credentials(user_id,password_hash) VALUES(?,?)').run(id,hash);
    db.prepare("INSERT INTO sessions(id,digest,user_id,scope,created,active,expires,remembered,authenticated) VALUES(?,?,?,'account',?,?,?,0,?)").run(randomUUID(),digest(cookie),id,now,now,now+3600000,now);
    db.exec('COMMIT');db.close();console.log(JSON.stringify({id,cookie}));
  `,
    ),
  );
  const { space } = await request(app, '/api/spaces', { name: 'CI sintética', requestId: randomUUID() });
  const period = '2028-11',
    endpoint = '/api/state?spaceId=' + space.id;
  let state = await request(app, endpoint);
  for (const action of [
    { type: 'month', period },
    { type: 'account', account: { id: 'bank', name: 'Banco fictício', color: '#446677', restricted: false } },
    { type: 'category', category: { id: 'group', name: 'Teste' } },
    { type: 'initial', source: 'a:bank', amount: 10000 },
    {
      type: 'line',
      line: {
        id: 'expense',
        name: 'Teste',
        kind: 'expense',
        accountId: 'bank',
        categoryId: 'group',
        plan: 1234,
      },
    },
    {
      type: 'execute',
      lineId: 'expense',
      amount: 1234,
      source: 'a:bank',
      date: period + '-02',
      complete: true,
    },
  ])
    state = await request(app, endpoint, {
      period,
      revision: state.revision,
      requestId: randomUUID(),
      action,
    });
  assert.equal(state.state.months[period].events.length, 1);
  docker(['stop', '-t', '30', app.id]);
  once('prepare');
  app = await start();
  state = await request(app, endpoint + '&period=' + period);
  assert.equal(state.state.months[period].events.length, 1);
  const proof = JSON.parse(
    docker(
      ['exec', '-i', app.id, 'node', '--input-type=module'],
      `
    import {connect,databasePath} from './src/server/storage.mjs';
    const db=connect(databasePath());console.log(JSON.stringify({
      delta:db.prepare('SELECT sum(delta) AS n FROM effects').get().n,
      cleanup:db.prepare('SELECT last_cleanup FROM privacy_control').get().last_cleanup
    }));db.close();
  `,
    ),
  );
  assert.equal(proof.delta, -1234);
  assert.ok(proof.cleanup > 0);
  docker(['stop', '-t', '30', app.id]);
  // Off-container copy represents off-server transport; includes the security authority.
  // The real VPS acceptance also exercises encryption, download and upload explicitly.
  docker([
    'run',
    '--rm',
    '--user',
    '0',
    '-v',
    root + ':/fixture',
    image,
    'node',
    '--input-type=module',
    '-e',
    `
    import {cpSync,renameSync,readdirSync,chownSync} from 'node:fs';
    cpSync('/fixture/state','/fixture/offsite',{recursive:true});
    renameSync('/fixture/state','/fixture/retained-original');
    cpSync('/fixture/offsite','/fixture/state',{recursive:true});
    function own(p){chownSync(p,1000,1000);for(const e of readdirSync(p,{withFileTypes:true})){
      const q=p+'/'+e.name;if(e.isDirectory())own(q);else chownSync(q,1000,1000);
    }}own('/fixture/state');
  `,
  ]);
  app = await start();
  assert.equal((await request(app, endpoint + '&period=' + period)).state.months[period].events.length, 1);
  assert.equal(
    docker(['exec', app.id, 'node', '-e', "console.log(require('node:fs').existsSync('/app/tests'))"]),
    'false',
  );
  console.log(
    'Passed: empty hosted init, native modules, readiness, workers, persisted payment, second container and paired recovery.',
  );
} finally {
  for (const id of containers) spawnSync('docker', ['rm', '-f', id], { stdio: 'ignore' });
  // CI-only temporary fixture; no project/real storage can be selected.
  if (root.startsWith(join(tmpdir(), 'omeumes-test-image-'))) {
    // Image UID owns SQLite; remove through the same isolated bind mount.
    spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--user',
        '0',
        '-v',
        root + ':/fixture',
        image,
        'node',
        '-e',
        "const fs=require('node:fs');for(const e of fs.readdirSync('/fixture'))fs.rmSync('/fixture/'+e,{recursive:true,force:true})",
      ],
      { stdio: 'ignore' },
    );
    rmSync(root, { recursive: true, force: true });
  }
}
