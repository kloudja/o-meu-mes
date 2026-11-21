import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { Secret,TOTP } from 'otpauth';
import { hashSync } from '@node-rs/argon2';
import { seal } from '../../src/modules/identity/secrets.mjs';
import { randomUUID,randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test as base } from '@playwright/test';

type Mail = { to: string; subject: string; text: string };
export type Application = {
  url: string;
  database: string;
  operator?:{id:string;email:string;password:string;otp:()=>string};
  emailLink(to: string, kind: 'verify' | 'reset' | 'email'): Promise<string>;
};

async function freePort() {
  const probe = createServer();
  await new Promise<void>((accept, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', accept);
  });
  const { port } = probe.address() as { port: number };
  await new Promise<void>((accept, reject) => probe.close(error => error ? reject(error) : accept()));
  return port;
}

export const test = base.extend<{ application: Application; testMailbox: boolean; rightsTest:boolean }>({
  testMailbox: [true, { option: true }],
  rightsTest:[false,{option:true}],
  application: async ({ testMailbox,rightsTest }, use) => {
    const temp = resolve(tmpdir());
    const directory = await mkdtemp(join(temp, 'omeumes-test-mu2-browser-'));
    const database = join(directory, 'identity.sqlite');
    const mailbox = join(directory, 'mailbox');
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const key=randomBytes(32),handlerId=randomUUID();
    const server = spawn(process.execPath, ['scripts/next.mjs', 'start'], {
      env: {
        ...process.env,
        OMEUMES_DB_PATH: database,
        OMEUMES_TEST_MODE: '1',
        OMEUMES_TEST_PORT: String(port),
        OMEUMES_TEST_TRANSITION: process.env.OMEUMES_TEST_TRANSITION ?? 'MU5',
        OMEUMES_TEST_MAILBOX: testMailbox ? '1' : '0',
        OMEUMES_MAIL_TRANSPORT: 'test',
        BREVO_API_KEY: undefined,
        BREVO_SENDER: undefined,
        OMEUMES_QA_GENERATED_PASSWORD: undefined,
        OMEUMES_AUTH_ORIGIN: url,
        OMEUMES_AUTH_KEY: key.toString('base64'),
        OMEUMES_RIGHTS_HANDLER:rightsTest?handlerId:undefined,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let diagnostic = '';
    server.stdout.on('data', data => { diagnostic += data; });
    server.stderr.on('data', data => { diagnostic += data; });
    const stopped = new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.once('close', () => accept());
    });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 150 && server.exitCode === null; attempt++) {
        const response = await fetch(url + '/api/identity', { signal: AbortSignal.timeout(500) }).catch(() => null);
        if (response?.ok) { ready = true; break; }
        await new Promise(accept => setTimeout(accept, 100));
      }
      if (!ready) throw new Error('Arranque sintético indisponível. ' + diagnostic);
      let operator:Application['operator'];
      if(rightsTest){
        const secret=new Secret({size:20}),pwd=randomBytes(28).toString('base64url'),email='responsavel.qa@example.invalid';
        const otp=new TOTP({secret,algorithm:'SHA1',digits:6,period:30});
        const db=new DatabaseSync(database,{timeout:5000});
        try{db.exec('BEGIN IMMEDIATE');
          db.prepare("INSERT INTO users(id,first_name,last_name,email,verified,country,created,adult_at) VALUES(?,'Responsável','de ensaio',?,1,'PT',?,?)").run(handlerId,email,Date.now(),Date.now());
          db.prepare('INSERT INTO credentials(user_id,password_hash,totp) VALUES(?,?,?)').run(handlerId,hashSync(pwd),seal(key,'totp:'+handlerId,secret.base32));
          db.exec('COMMIT');
        }finally{db.close();}
        operator={id:handlerId,email,password:pwd,otp:()=>otp.generate()};
      }
      await use({
        database, url,operator,
        async emailLink(to, kind) {
          for (let attempt = 0; attempt < 100; attempt++) {
            const files = await readdir(mailbox).catch(() => []);
            for (const file of files.filter(name => name.endsWith('.json'))) {
              const message: Mail = JSON.parse(await readFile(join(mailbox, file), 'utf8'));
              if (message.to !== to) continue;
              const link = message.text.match(new RegExp('https?://[^\\s]+/#' + kind + '=[^\\s]+'))?.[0];
              if (link && new URL(link).origin === url) return link;
            }
            await new Promise(accept => setTimeout(accept, 100));
          }
          throw new Error('A caixa de correio sintética não recebeu a ligação esperada.');
        },
      });
    } finally {
      server.kill();
      await stopped;
      if (dirname(directory) === temp && directory.startsWith(join(temp, 'omeumes-test-mu2-browser-'))) {
        await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  },
  baseURL: async ({ application }, use) => { await use(application.url); },
});

export { expect } from '@playwright/test';

export function syntheticCredentials() {
  return {
    email: 'ana.qa@example.invalid',
    // Allows the external QA run to exercise a freshly generated Bitwarden passphrase.
    password: process.env.OMEUMES_QA_GENERATED_PASSWORD || randomBytes(24).toString('base64url'),
    firstName: 'Ana Maria', lastName: 'Silva Reis',
    country: 'PT', terms: 'dev-2', adult: true,
  };
}
