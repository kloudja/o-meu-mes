import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createBackup } from '../../src/server/local-files.mjs';
import { migrateSynthetic } from '../migrate-synthetic';
import { createSpace } from '../../src/modules/spaces/schema.mjs';
import { authorizeSpace } from '../../src/modules/spaces/access';
import { readMonth } from '../../src/modules/finance/infrastructure/repository';
import { assignLegacy } from '../../src/server/assign-legacy.mjs';
import { migrations, migrate } from '../../src/server/storage.mjs';
import { expect, it } from 'vitest';
import { balance, realized, sourceTotals, summary, type Action } from '../../src/modules/finance/domain/engine';
import { Repository, type Command } from '../legacy/repository';
import { writeTestCatalog } from '../fixtures';

function windowsCommand(path: string, command: string, port: number, authorize=false) {
  const child = spawn('cmd.exe', ['/d', '/c', command], {
    env: { ...process.env, OMEUMES_TEST_MODE: '1', OMEUMES_DB_PATH: path, OMEUMES_TEST_PORT: String(port),
      OMEUMES_AUTH_KEY:randomBytes(32).toString('base64'), OMEUMES_AUTH_ORIGIN:'http://127.0.0.1:'+port,
      OMEUMES_TEST_TRANSITION:authorize?'MU5':'', OMEUMES_MAIL_TRANSPORT:'test' },
    stdio: 'pipe', windowsHide: true,
  });
  let log = '';
  child.stdout.on('data', buffer => { log += buffer.toString(); });
  child.stderr.on('data', buffer => { log += buffer.toString(); });
  const done = new Promise<number | null>((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  return {
    child, done, log: () => log,
    async stop() {
      if (child.exitCode === null && child.pid) {
        execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      }
      await done;
    },
  };
}

async function ready(command: ReturnType<typeof windowsCommand>) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const url = command.log().match(/Abra (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (url) {
      try { if ((await fetch(url + '/api/state')).status===403) return url; } catch {}
    }
    if (command.child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(command.log());
}

const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');

it.skipIf(process.platform !== 'win32')('recusa uma porta ocupada e usa o mesmo endereço para abrir a cópia recuperada', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omeumes-test-recovery-'));
  writeTestCatalog(root);
  const original = join(root, 'base de ensaio.sqlite');
  const restored = join(root, 'cópia recuperada.sqlite');
  const occupied = createServer((_req, res) => res.end('processo independente'));
  await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const port = (occupied.address() as { port: number }).port;
  const blocked = windowsCommand(original, 'Iniciar.cmd', port);
  blocked.child.stdin.end();
  try {
    expect(await blocked.done).toBe(1);
    expect(blocked.log()).toContain(`Porta ${port} ocupada`);
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('processo independente');
  } finally {
    await new Promise<void>(resolve => occupied.close(() => resolve()));
  }
  // Construct the last pre-MU schema, including a sentinel outside the financial projection.
  migrateSynthetic(original,migrations.slice(0,4));
  const legacy=new DatabaseSync(original);
  const previous=String(legacy.prepare('SELECT period FROM months').get()?.period);
  legacy.prepare('INSERT INTO excel_imports VALUES(?,?)').run(previous,'{"source":"synthetic"}');
  legacy.close();
  const beforeTransition=hash(original), filesBefore=readdirSync(root);
  const refused=windowsCommand(original,'Iniciar.cmd',port);
  refused.child.stdin.end();
  expect(await refused.done).toBe(1);
  expect(refused.log()).toContain('Transição multiutilizador por autorizar');
  expect(hash(original)).toBe(beforeTransition);
  expect(readdirSync(root)).toEqual(filesBefore);
    const repository=new Repository(original);
    const first=repository.read();
    const period = first.state.selected;
    const next = new Date(`${period}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const nextPeriod = next.toISOString().slice(0, 7);
    const date = `${period}-02`;
    expect(Object.keys(first.state.months)).toEqual([period]);
    expect(first.state.months[period]).toMatchObject({ lines: [], events: [], occurrences: [] });
    expect(Object.values(first.state.months[period].initials).every(value => value === null)).toBe(true);
    expect(first.state.base).toEqual([]);
    let revision = first.revision;
    async function send(requestId: string, action: Action, target = period) {
      const command: Command = { requestId, revision, action, period: target };
      revision=repository.command(command).revision;
      return command;
    }
    const expense = { id: 'compra', name: 'Compra fictícia — revisão, café', kind: 'expense' as const,
      accountId: 'act-r', categoryId: 'cat-alimentacao', plan: 8500 };
    const saving = { id: 'reforco', name: 'Reforço fictício', kind: 'saving' as const,
      accountId: 'act-r', categoryId: 'cat-poupancas', reserveId: 'reserva', plan: 10000 };
    const reservedExpense = { ...expense, id: 'reserva-despesa', name: 'Despesa pela reserva', reserveId: 'reserva', plan: 4000 };
    const A = 'a:act-r', B = 'a:act-s', R = 'r:reserva';
    await send('reserva', { type: 'reserve', reserve: { id: 'reserva', name: 'Reserva fictícia', accountId: 'act-r' } });
    for (const line of [expense, saving, reservedExpense]) {
      await send('plano-' + line.id, { type: 'line', line });
      await send('modelo-' + line.id, { type: 'line', line, target: 'base' });
    }
    for (const [source, amount] of [[A, 100000], [B, 20000], [R, 0]] as const) {
      await send('saldo-' + source.replace(':', '-'), { type: 'initial', source, amount });
    }
    await send('snapshot', { type: 'snapshot', date });
    await send('mudar-plano', { type: 'line', line: { ...expense, plan: 9000 } });
    const payment = await send('pagar', { type: 'execute', lineId: expense.id, source: A, amount: 4000, complete: false, date });
    await send('transferir', { type: 'transfer', source: A, destination: B, amount: 25000, date });
    await send('reservar', { type: 'execute', lineId: saving.id, source: A, amount: 10000, complete: true, date });
    await send('usar-reserva', { type: 'execute', lineId: reservedExpense.id, source: R, amount: 1500, complete: false, date });
    const reminder = { id: 'revisao', name: 'Revisão fictícia', date, frequency: 'monthly' as const,
      active: true, accountId: 'act-r', amount: null };
    await send('agenda-revisao', { type: 'recurring', definition: reminder });
    await send('agenda-dispensar', { type: 'recurring', definition: { ...reminder, id: 'dispensa', name: 'Dispensa fictícia', amount: 1234 } });
    await send('segundo-mes', { type: 'month', period: nextPeriod });
    await send('ligar', { type: 'occurrence', id: `revisao:${nextPeriod}`, mode: 'add' }, nextPeriod);
    await send('dispensar', { type: 'occurrence', id: `dispensa:${nextPeriod}`, mode: 'dismiss' }, nextPeriod);
    const before = repository.read(period);
    expect(Object.keys(before.state.months)).toEqual([period, nextPeriod]);

    const target=join(root,'espaços.sqlite');
    migrate(target,undefined,true);
    const userId=randomUUID();
    const setup=new DatabaseSync(target);
    setup.exec('BEGIN IMMEDIATE');
    setup.prepare("INSERT INTO users(id,first_name,last_name,email,verified,country,adult_at,created) VALUES(?,'Ana','Teste','a@example.invalid',1,'PT',1,1)").run(userId);
    const space=createSpace(setup,userId,'Recuperação',randomUUID());
    setup.exec('COMMIT');setup.close();
    const oldBackup=await createBackup(original);
    assignLegacy(oldBackup.path,target,userId,String(space.id));
    const inspect=(path:string,month:string)=>{
      const db=new DatabaseSync(path,{readOnly:true});
      try{db.exec('BEGIN');return readMonth(db,authorizeSpace(db,userId,String(space.id),'read'),month);}finally{db.close();}
    };
    const expected=inspect(target,period);
    const server=windowsCommand(target,'Iniciar.cmd',port);
    try{
      const url=await ready(server);
      expect(url).toBe(`http://127.0.0.1:${port}`);
      expect((await fetch(url+'/demo')).status).toBe(404);
    for(const action of ['backup','export']){
      expect((await fetch(url+'/api/local-files?action='+action,{method:'POST',headers:{origin:url}})).status).toBe(403);
    }
    const backup=await createBackup(target);
    const backupBytes = readFileSync(backup.path);
    await server.stop();
    const originalBytes = readFileSync(target);

    const recovery = windowsCommand(target, 'Restaurar.cmd', port);
    recovery.child.stdin.end(`"${backup.path}"\n"${restored}"\ns\ns\n`, 'utf8');
    try {
      const recoveryUrl = await ready(recovery);
      const log = recovery.log();
      expect(log).toContain(`Origem:  ${backup.path}`);
      expect(log).toContain(`Destino: ${restored}`);
      expect(log.indexOf('Destino:')).toBeLessThan(log.indexOf('A copiar e verificar'));
      expect(log).toContain('Restauro verificado');
      expect(recoveryUrl).toBe(url);
      expect((await fetch(recoveryUrl+'/api/identity')).status).toBe(503);
      const recovered=inspect(restored,period);
      expect(recovered).toEqual(expected);
      const m = recovered.state.months[period];
      const second = inspect(restored,nextPeriod).state.months[nextPeriod];
      expect([balance(m, A), balance(m, B), balance(m, R)]).toEqual([61000, 45000, 8500]);
      expect(balance(m, 'a:bank')).toBeNull();
      expect(realized(m, expense.id) + realized(m, reservedExpense.id)).toBe(5500);
      expect(summary(recovered.state, m)).toMatchObject({ available: 106000, expenses: 7500, savings: 0, free: 101000 });
      expect(sourceTotals(recovered.state, m)).toMatchObject({ reserved: 8500, wealth: 114500 });
      expect(m.snapshot?.lines.find(line => line.id === expense.id)?.plan).toBe(8500);
      expect(m.lines.find(line => line.id === expense.id)?.plan).toBe(9000);
      expect(second.events).toEqual([]);
      expect(second.initials).toMatchObject({ [A]: 61000, [B]: 45000, [R]: null, 'a:bank': null });
      expect(second.occurrences.map(o => [o.state, o.amount])).toEqual([['linked', null], ['dismissed', 1234]]);
      expect(m.events).toHaveLength(4);

      const db=new DatabaseSync(restored,{readOnly:true});
      try {
        expect(db.prepare('SELECT count(*) AS n FROM users').get()?.n).toBe(1);
        expect(db.prepare('SELECT request_id FROM legacy_receipts WHERE space_id=? AND request_id=?').get(space.id,payment.requestId)).toBeTruthy();
        expect(db.prepare('SELECT payload FROM excel_imports').get()?.payload).toBe('{"source":"synthetic"}');
      } finally { db.close(); }
    } finally { await recovery.stop(); }
    expect(readFileSync(backup.path)).toEqual(backupBytes);
    expect(readFileSync(target)).toEqual(originalBytes);
    expect(readdirSync(root).some(name => name.startsWith('.omeumes-incompleto-'))).toBe(false);
    const reopened = windowsCommand(target, 'Iniciar.cmd', port);
    try { expect(await ready(reopened)).toBe(url); expect(inspect(target,period)).toEqual(expected); }
    finally { await reopened.stop(); }
  } finally {
    await server.stop();
  }
});

it.skipIf(process.platform !== 'win32')('Iniciar.cmd mostra como agir perante uma base inválida ou caminho sem escrita', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omeumes-test-start-error-'));
  const corrupt = join(root, 'danificada.sqlite');
  writeFileSync(corrupt, 'não é uma base de dados');
  const original = readFileSync(corrupt);
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  for (const path of [corrupt, join(corrupt, 'novo.sqlite')]) {
    const command = windowsCommand(path, 'Iniciar.cmd', port);
    command.child.stdin.end();
    expect(await command.done).toBe(1);
    expect(command.log()).toContain('Restaurar.cmd');
    expect(command.log()).not.toContain('Abra http://');
    expect(readFileSync(corrupt)).toEqual(original);
  }
});
