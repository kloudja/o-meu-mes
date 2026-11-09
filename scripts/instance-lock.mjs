import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function lockDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const canonical = existsSync(path) ? realpathSync(path) : join(realpathSync(dirname(path)), basename(path));
  const lock = new DatabaseSync(`${canonical}.instance-lock.sqlite`, { timeout: 0 });
  try { lock.exec('BEGIN EXCLUSIVE'); }
  catch {
    lock.close();
    throw new Error('Já existe uma instância de O meu mês a usar esta base. Pare-a primeiro.');
  }
  return lock;
}

// Child next start is killed if its supervisor disappears.
if (process.send) process.once('disconnect', () => process.exit(0));
