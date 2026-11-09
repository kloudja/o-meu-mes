import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect as browserExpect } from '@playwright/test';
import { expect, it } from 'vitest';
import { balance, realized, sourceTotals, summary, type Action } from '../../src/domain/engine';
import type { Command, Confirmed } from '../../src/server/repository';

function windowsCommand(path: string, command: string, args: string[] = []) {
  const child = spawn('cmd.exe', ['/d', '/c', command, ...args], {
    env: { ...process.env, OMEUMES_TEST_MODE: '1', OMEUMES_DB_PATH: path },
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
      try { if ((await fetch(url + '/api/state')).ok) return url; } catch {}
    }
    if (command.child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(command.log());
}

const get = async (url: string, period?: string): Promise<Confirmed> =>
  (await fetch(url + '/api/state' + (period ? '?period=' + period : ''))).json();
const post = (url: string, endpoint: string, body?: unknown, origin = url) =>
  fetch(url + endpoint, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

it.skipIf(process.platform !== 'win32')('arranca com porta ocupada, recupera dois meses e abre a cópia no Edge', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omeumes-test-recovery-'));
  const original = join(root, 'base de ensaio.sqlite');
  const restored = join(root, 'cópia recuperada.sqlite');
  const occupied = createServer((_req, res) => res.end('processo independente'));
  await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const port = (occupied.address() as { port: number }).port;
  const server = windowsCommand(original, 'Iniciar.cmd', ['--port', String(port)]);
  try {
    const url = await ready(server);
    expect(url).not.toBe(`http://127.0.0.1:${port}`);
    expect(server.log()).toContain(`Porta ${port} ocupada`);
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('processo independente');
    const first = await get(url);
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
      const response = await post(url, '/api/state', command);
      expect(response.ok, await response.clone().text()).toBe(true);
      revision = (await response.json()).revision;
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
    const before = await get(url, period);
    expect(Object.keys(before.state.months)).toEqual([period, nextPeriod]);

    const endpoint = '/api/local-files?action=';
    expect((await post(url, endpoint + 'backup', undefined, 'https://exemplo.invalid')).status).toBe(403);
    expect((await post(url, endpoint + 'export', undefined, 'https://exemplo.invalid')).status).toBe(403);
    expect(existsSync(join(root, 'backups'))).toBe(false);
    const exported = await post(url, endpoint + 'export');
    expect(exported.headers.get('content-type')).toContain('charset=utf-8');
    expect(exported.headers.get('cache-control')).toBe('no-store');
    expect(await exported.json()).toMatchObject({
      format: 'o-meu-mes-export', version: 1, currency: 'EUR', moneyUnit: 'cent', revision,
      accounts: before.state.accounts, categories: before.state.categories, reserves: before.state.reserves,
      base: before.state.base, recurring: before.state.recurring, months: before.state.months,
    });
    writeFileSync(join(root, 'backups'), 'bloquear criação da pasta');
    expect((await post(url, endpoint + 'backup')).status).toBe(503);
    expect(await get(url, period)).toEqual(before);
    expect(readFileSync(join(root, 'backups'), 'utf8')).toBe('bloquear criação da pasta');
    // Free the intended directory name without removing the failure fixture.
    const { renameSync } = await import('node:fs');
    renameSync(join(root, 'backups'), join(root, 'bloqueio-backup.txt'));
    const backupResponse = await post(url, endpoint + 'backup');
    expect(backupResponse.ok, await backupResponse.clone().text()).toBe(true);
    const backup = await backupResponse.json();
    expect(existsSync(backup.path)).toBe(true);
    const backupBytes = readFileSync(backup.path);
    await server.stop();
    const originalBytes = readFileSync(original);

    const recovery = windowsCommand(original, 'Restaurar.cmd');
    recovery.child.stdin.end(`"${backup.path}"\n"${restored}"\ns\ns\n`, 'utf8');
    try {
      const recoveryUrl = await ready(recovery);
      const log = recovery.log();
      expect(log).toContain(`Origem:  ${backup.path}`);
      expect(log).toContain(`Destino: ${restored}`);
      expect(log.indexOf('Destino:')).toBeLessThan(log.indexOf('A copiar e verificar'));
      expect(log).toContain('Restauro verificado');
      expect(recoveryUrl).not.toBe(url);
      const recovered = await get(recoveryUrl, period);
      expect(recovered).toEqual(before);
      const m = recovered.state.months[period];
      const second = recovered.state.months[nextPeriod];
      expect([balance(m, A), balance(m, B), balance(m, R)]).toEqual([61000, 45000, 8500]);
      expect(balance(m, 'a:bank')).toBeNull();
      expect(realized(m, expense.id) + realized(m, reservedExpense.id)).toBe(5500);
      expect(summary(recovered.state, m)).toMatchObject({ available: 106000, expenses: 7500, savings: 0, free: 101000 });
      expect(sourceTotals(recovered.state, m)).toMatchObject({ reserved: 8500, wealth: 114500 });
      expect(m.snapshot?.lines.find(line => line.id === expense.id)?.plan).toBe(8500);
      expect(m.lines.find(line => line.id === expense.id)?.plan).toBe(9000);
      expect(second.events).toEqual([]);
      expect(Object.values(second.initials).every(amount => amount === null)).toBe(true);
      expect(second.occurrences.map(o => [o.state, o.amount])).toEqual([['linked', null], ['dismissed', 1234]]);
      const replay = await (await post(recoveryUrl, '/api/state', payment)).json();
      expect(replay).toEqual({ ...recovered, replay: true });
      expect(await get(recoveryUrl, period)).toEqual(before);
      expect(m.events).toHaveLength(4);

      const browser = await chromium.launch({
        executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      });
      try {
        const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'pt-PT' });
        await page.addInitScript(() => localStorage.setItem('omeumes.pending.v1:teste', '{}'));
        await page.goto(recoveryUrl);
        await browserExpect(page.getByText('Cópia recuperada — SQLite')).toBeVisible();
        await browserExpect(page.getByRole('button', { name: 'Repetir confirmação' })).toHaveCount(0);
        await page.getByLabel('Mês selecionado').selectOption(period);
        await browserExpect(page.getByLabel('Mês selecionado')).toHaveValue(period);
        const metric = (label: RegExp) => page.locator('.metric').filter({ hasText: label }).locator('strong');
        await browserExpect(metric(/^Saldo atual das contas/)).toContainText('1.060,00');
        await browserExpect(metric(/^Despesas por pagar/)).toContainText('75,00');
        await page.getByRole('navigation').getByRole('button',{name:'Plano e movimentos',exact:true}).click();
        await browserExpect(page.getByTestId('line-compra')).toContainText('40,00');
        await page.screenshot({ path: 'docs/capturas/fase-5/copia-recuperada-1366.png', animations: 'disabled' });
      } finally { await browser.close(); }
    } finally { await recovery.stop(); }
    expect(readFileSync(backup.path)).toEqual(backupBytes);
    expect(readFileSync(original)).toEqual(originalBytes);
    expect(readdirSync(root).some(name => name.startsWith('.omeumes-incompleto-'))).toBe(false);
    const reopened = windowsCommand(original, 'Iniciar.cmd', ['--port', String(port)]);
    try { expect(await get(await ready(reopened), period)).toEqual(before); }
    finally { await reopened.stop(); }
  } finally {
    await server.stop();
    await new Promise<void>(resolve => occupied.close(() => resolve()));
  }
});

it.skipIf(process.platform !== 'win32')('Iniciar.cmd mostra como agir perante uma base inválida ou caminho sem escrita', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omeumes-test-start-error-'));
  const corrupt = join(root, 'danificada.sqlite');
  writeFileSync(corrupt, 'não é uma base de dados');
  const original = readFileSync(corrupt);
  for (const path of [corrupt, join(corrupt, 'novo.sqlite')]) {
    const command = windowsCommand(path, 'Iniciar.cmd');
    command.child.stdin.end();
    expect(await command.done).toBe(1);
    expect(command.log()).toContain('Restaurar.cmd');
    expect(command.log()).not.toContain('Abra http://');
    expect(readFileSync(corrupt)).toEqual(original);
  }
});
