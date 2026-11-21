import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { settings } from '../modules/identity/policy.mjs';

// Separate capabilities: neither is the disposable-fixture migration permission.
export const initializeHosted = Symbol('initialize fresh hosted database');
export const upgradeHosted = Symbol('upgrade hosted database after offline snapshot');

export function hostedPaths(env = process.env) {
  if (env.OMEUMES_RUNTIME !== 'hosted') throw new Error('Execução alojada não configurada.');
  for (const name of Object.keys(env)) {
    if (
      env[name] &&
      (/^OMEUMES_TEST_/.test(name) ||
        ['OMEUMES_BUILD_DIR', 'OMEUMES_RECOVERY_SCOPE', 'OMEUMES_RELEASED_PATH'].includes(name))
    )
      throw new Error('Configuração de teste/recuperação local recusada no alojamento.');
  }
  const root = env.OMEUMES_DATA_ROOT;
  if (
    !root ||
    !isAbsolute(root) ||
    !existsSync(/* turbopackIgnore: true */ root) ||
    realpathSync(/* turbopackIgnore: true */ root) !== resolve(/* turbopackIgnore: true */ root)
  )
    throw new Error('A pasta persistente tem de existir e não pode ser uma ligação.');
  const project = resolve(/* turbopackIgnore: true */ env.OMEUMES_PROJECT_ROOT || process.cwd());
  const inside = relative(project, root);
  if (
    inside === '' ||
    (!inside.startsWith('..' + sep) && !isAbsolute(inside)) ||
    /(^|[\\/])public([\\/]|$)/i.test(root)
  )
    throw new Error('Os dados alojados têm de ficar fora da aplicação.');
  const databaseDirectory = join(root, 'database');
  const authorityDirectory = join(root, 'authority');
  for (const folder of [databaseDirectory, authorityDirectory]) {
    if (
      !existsSync(/* turbopackIgnore: true */ folder) ||
      realpathSync(/* turbopackIgnore: true */ folder) !== resolve(/* turbopackIgnore: true */ folder)
    )
      throw new Error('Prepare as pastas database e authority no volume persistente.');
  }
  const path = env.OMEUMES_DB_PATH;
  if (
    !path ||
    !isAbsolute(path) ||
    dirname(path) !== databaseDirectory ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.sqlite$/.test(path.slice(databaseDirectory.length + 1))
  )
    throw new Error('A base alojada tem de ser um ficheiro SQLite na pasta database.');
  const registry = join(authorityDirectory, 'recovery.sqlite');
  if (env.OMEUMES_RECOVERY_REGISTRY !== registry) throw new Error('Registo de recuperação alojado inválido.');
  for (const file of [path, registry]) {
    for (const suffix of ['', '-wal', '-shm', '-journal', '.instance-lock.sqlite']) {
      const entry = lstatSync(file + suffix, { throwIfNoEntry: false });
      if (
        entry &&
        (!entry.isFile() || entry.nlink !== 1 || realpathSync(file + suffix) !== resolve(file + suffix))
      )
        throw new Error('Ligação ou ficheiro persistente inesperado.');
    }
  }
  return { root, path, registry };
}

export function hostedSettings(env = process.env) {
  const paths = hostedPaths(env);
  const config = settings(env);
  const recoveryKey = Buffer.from(env.OMEUMES_RECOVERY_KEY || '', 'base64');
  if (
    !config.secure ||
    config.transport !== 'brevo' ||
    recoveryKey.length !== 32 ||
    recoveryKey.toString('base64') !== env.OMEUMES_RECOVERY_KEY ||
    recoveryKey.equals(config.key)
  )
    throw new Error('O alojamento exige HTTPS, Brevo e duas chaves independentes de 32 bytes.');
  return { ...paths, config };
}
