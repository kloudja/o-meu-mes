import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import { createBackup, restoreBackup } from '../../src/server/local-files.mjs';
import { connect, migrate } from '../../src/server/storage.mjs';
import { Repository } from '../../src/server/repository';

vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, linkSync: vi.fn(fs.linkSync) };
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'omeumes-test-files-'));
  const source = join(root, 'original.sqlite');
  migrate(source);
  return { root, source, repo: new Repository(source) };
}

it('copia commits ainda em WAL, incluindo uma transação confirmada durante a cópia', async () => {
  const { root, source, repo } = setup();
  const keeper = connect(source);
  keeper.exec('PRAGMA wal_autocheckpoint=0');
  try {
    const { state } = repo.read();
    const period = state.selected;
    const write = (revision: number, source: string, amount: number) => repo.command({
      period, revision, requestId: source.replace(':', '-'),
      action: { type: 'initial', source, amount },
    });
    write(0, 'a:act-r', 12345);
    expect(statSync(source + '-wal').size).toBeGreaterThan(32);
    let wrote = false;
    const result = await createBackup(source, {
      rate: 1,
      progress: ({ remainingPages }) => {
        if (!wrote && remainingPages > 0) {
          write(1, 'a:act-s', 6789);
          wrote = true;
        }
      },
    });
    expect(wrote).toBe(true);
    expect(readdirSync(dirname(result.path))).toEqual([result.path.split(/[\\/]/).at(-1)]);
    const restored = join(root, 'recuperado.sqlite');
    await restoreBackup(result.path, restored, source);
    migrate(restored);
    const data = new Repository(restored).read();
    expect(data).toEqual(repo.read());
    expect(data.state.months[period].initials).toMatchObject({ 'a:act-r': 12345, 'a:act-s': 6789, 'a:bank': null });
    expect(data.revision).toBe(2);
  } finally { keeper.close(); }
});

it('recusa cópias ilegíveis, alheias, futuras e com relações quebradas, sem publicar destino', async () => {
  const { root, source } = setup();
  const backup = await createBackup(source);
  const destination = join(root, 'recuperado.sqlite');
  const corrupt = join(root, 'corrompido.sqlite');
  writeFileSync(corrupt, 'ficheiro danificado');
  const foreign = join(root, 'alheio.sqlite');
  const other = new DatabaseSync(foreign);
  other.exec('CREATE TABLE test (id INTEGER)');
  other.close();
  for (const invalid of [corrupt, foreign]) {
    await expect(restoreBackup(invalid, destination, source)).rejects.toThrow();
    expect(existsSync(destination)).toBe(false);
  }
  const db = new DatabaseSync(backup.path, { enableForeignKeyConstraints: false });
  try {
    db.exec('PRAGMA user_version=999');
    await expect(restoreBackup(backup.path, destination, source)).rejects.toThrow(/versão compatível/);
    db.exec("PRAGMA user_version=3; INSERT INTO reserves VALUES ('broken','missing','{}')");
    await expect(restoreBackup(backup.path, destination, source)).rejects.toThrow(/referências inválidas/);
  } finally { db.close(); }
  expect(existsSync(destination)).toBe(false);
  expect(readdirSync(root).some(name => name.startsWith('.omeumes-incompleto-'))).toBe(false);
});

it('protege origem, caminho habitual, destinos existentes e públicos e permite repetir após uma falha de escrita', async () => {
  const { root, source } = setup();
  const original = readFileSync(source);
  const backup = await createBackup(source);
  const copied = readFileSync(backup.path);
  const existing = join(root, 'existente.sqlite');
  const destination = join(root, 'recuperado.sqlite');
  writeFileSync(existing, 'preservar');
  await expect(restoreBackup(backup.path, existing, source)).rejects.toThrow(/já existe/);
  await expect(restoreBackup(backup.path, source, source)).rejects.toThrow(/base habitual/);
  await expect(restoreBackup(backup.path, join(root, 'public', 'novo.sqlite'), source)).rejects.toThrow(/public/);
  if (process.platform === 'win32') {
    const publicFolder = join(root, 'public');
    mkdirSync(publicFolder);
    const alias = join(root, 'atalho');
    const { symlinkSync } = await import('node:fs');
    symlinkSync(publicFolder, alias, 'junction');
    await expect(restoreBackup(backup.path, join(alias, 'novo.sqlite'), source)).rejects.toThrow(/public/);
  }

  const denied = Object.assign(new Error('Escrita recusada'), { code: 'EACCES' });
  vi.mocked(linkSync).mockImplementationOnce(() => { throw denied; });
  await expect(restoreBackup(backup.path, destination, source)).rejects.toThrow(denied);
  expect(existsSync(destination)).toBe(false);
  expect(readdirSync(root).some(name => name.startsWith('.omeumes-incompleto-'))).toBe(false);
  vi.mocked(linkSync).mockImplementationOnce(() => { throw denied; });
  await expect(createBackup(source)).rejects.toThrow(denied);
  expect(readdirSync(dirname(backup.path))).toHaveLength(1);
  expect(readFileSync(source)).toEqual(original);
  expect(readFileSync(backup.path)).toEqual(copied);
  expect(readFileSync(existing, 'utf8')).toBe('preservar');
  await restoreBackup(backup.path, destination, source);
  expect(readFileSync(destination)).toEqual(copied);
  expect((await createBackup(source)).path).not.toBe(backup.path);
});
