import { randomUUID } from 'node:crypto';
import {
  closeSync, copyFileSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, realpathSync, rmdirSync, statSync, unlinkSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { APP_ID, databasePath, migrations } from './storage.mjs';

export class LocalFileError extends Error {}

function canonicalPath(path) {
  const resolved = resolve(/* turbopackIgnore: true */ path);
  try { return realpathSync(resolved); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(resolved);
    if (parent === resolved) throw error;
    return join(/* turbopackIgnore: true */ canonicalPath(parent), basename(resolved));
  }
}

const pathKey = path => process.platform === 'win32' ? path.toLowerCase() : path;
const present = path => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
const sidecars = path => ['-wal', '-shm', '-journal'].map(suffix => path + suffix);

export function privatePath(path) {
  if (!isAbsolute(path)) throw new LocalFileError('Indique um caminho absoluto.');
  const canonical = canonicalPath(path);
  for (const candidate of [resolve(/* turbopackIgnore: true */ path), canonical]) {
    if (/(^|[\\/])public([\\/]|$)/i.test(candidate)) {
      throw new LocalFileError('Escolha um caminho fora de pastas public.');
    }
    if (process.env.OMEUMES_TEST_MODE === '1' && !/[\\/]omeumes-test-[^\\/]+[\\/]/.test(candidate)) {
      throw new LocalFileError('Os ensaios só podem usar pastas omeumes-test-*.');
    }
  }
  return canonical;
}

function verifyCopy(path) {
  const db = new DatabaseSync(path, { readOnly: true, timeout: 1500 });
  try {
    db.exec('PRAGMA trusted_schema=OFF');
    const pragma = name => Object.values(db.prepare(`PRAGMA ${name}`).get())[0];
    const version = pragma('user_version');
    if (pragma('application_id') !== APP_ID || version < 1 || version > migrations.length) {
      throw new LocalFileError('O ficheiro não é uma cópia de O meu mês com versão compatível.');
    }
    if (pragma('journal_mode') !== 'delete') {
      throw new LocalFileError('Escolha uma cópia autónoma criada com «Criar backup».');
    }
    const schema = db => db.prepare('SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all();
    const expected = new DatabaseSync(':memory:');
    try {
      for (const migration of migrations.slice(0, version)) expected.exec(migration);
      if (JSON.stringify(schema(db)) !== JSON.stringify(schema(expected))) {
        throw new LocalFileError('A estrutura da cópia não corresponde à versão indicada.');
      }
    } finally { expected.close(); }
    if (db.prepare('SELECT format FROM meta WHERE id=1').get()?.format !== 1 ||
        !db.prepare('SELECT 1 FROM months LIMIT 1').get()) {
      throw new LocalFileError('Faltam dados essenciais na cópia.');
    }
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' ||
        db.prepare('PRAGMA foreign_key_check').all().length) {
      throw new LocalFileError('A cópia tem dados danificados ou referências inválidas.');
    }
  } finally { db.close(); }
}

async function publishCopy(destination, write) {
  if ([destination, ...sidecars(destination)].some(present)) {
    throw new LocalFileError('O destino ou um ficheiro auxiliar já existe. Escolha um nome novo.');
  }
  const staging = mkdtempSync(join(dirname(destination), '.omeumes-incompleto-'));
  const draft = join(staging, 'copia.sqlite');
  try {
    await write(draft);
    verifyCopy(draft);
    const fd = openSync(draft, 'r+');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    if (sidecars(destination).some(present)) {
      throw new LocalFileError('Existe um ficheiro auxiliar no destino. Escolha outro nome.');
    }
    // Same volume. The final name appears in one step and can never replace a file.
    linkSync(draft, destination);
  } finally {
    try {
      for (const path of [draft, ...sidecars(draft)]) if (present(path)) unlinkSync(path);
      rmdirSync(staging);
    } catch (error) {
      console.error('Limpeza da área temporária de cópia', error.code);
    }
  }
}

/** @param {string} [path] @param {import('node:sqlite').BackupOptions} [options] */
export async function createBackup(path = databasePath(), options = {}) {
  const source = privatePath(path);
  if (!existsSync(/* turbopackIgnore: true */ source)) throw new LocalFileError('A base local não está disponível. Verifique o arranque.');
  const folder = privatePath(join(dirname(source), 'backups'));
  mkdirSync(folder, { recursive: true });
  const started = new Date().toISOString().replaceAll(':', '-');
  const destination = join(folder, `o-meu-mes-${started}-${randomUUID()}.sqlite`);
  await publishCopy(destination, async draft => {
    const db = new DatabaseSync(source, { readOnly: true, timeout: 1500 });
    try { await backup(db, draft, options); } finally { db.close(); }
    const copy = new DatabaseSync(draft, { timeout: 1500 });
    try { copy.exec('PRAGMA journal_mode=DELETE'); } finally { copy.close(); }
  });
  return { path: destination, createdAt: new Date().toISOString() };
}

export function recoveryPaths(source, destination, active = databasePath()) {
  const from = privatePath(source);
  const to = privatePath(destination);
  const activePath = privatePath(active);
  if (!/\.sqlite$/i.test(basename(to)) || /[:<>|?*]/.test(basename(to))) {
    throw new LocalFileError('Indique um nome de destino novo com extensão .sqlite.');
  }
  if ([from, activePath, ...sidecars(activePath)].map(pathKey).includes(pathKey(to))) {
    throw new LocalFileError('Escolha um destino separado da origem e da base habitual.');
  }
  if (!present(from) || !statSync(/* turbopackIgnore: true */ from).isFile()) throw new LocalFileError('Escolha um ficheiro de backup existente.');
  if (sidecars(from).some(present)) throw new LocalFileError('Escolha uma cópia autónoma criada com «Criar backup».');
  if (!present(dirname(to)) || !statSync(dirname(to)).isDirectory()) {
    throw new LocalFileError('Escolha uma pasta de destino existente.');
  }
  return { source: from, destination: to };
}

export async function restoreBackup(source, destination, active = databasePath()) {
  const paths = recoveryPaths(source, destination, active);
  await publishCopy(paths.destination, draft => copyFileSync(paths.source, draft));
  return paths;
}
