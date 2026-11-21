import { closeSync, existsSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { hostedPaths, initializeHosted, upgradeHosted } from './hosted-config.mjs';

const refusal =
  'Transição multiutilizador por autorizar. A base foi preservada. Use o código correspondente à versão da base.';
export const currentSchema = 9;

/** The MU1 capability is confined to disposable OS-temp fixtures, even for direct CLI calls. */
export function assertSynthetic(path) {
  const root = realpathSync(tmpdir());
  if (!isAbsolute(path) || !existsSync(dirname(path))) throw new Error(refusal);
  const directory = realpathSync(dirname(path));
  const inside = relative(root, directory);
  const project = relative(realpathSync(process.cwd()), directory);
  if (
    !/^omeumes-test-[^\\/]+$/i.test(inside.split(sep)[0]) ||
    (!project.startsWith('..' + sep) && !isAbsolute(project)) ||
    resolve(directory, basename(path)).toLowerCase() !== resolve(path).toLowerCase()
  )
    throw new Error(refusal);
  assertSingleFiles(path);
}

function assertSingleFiles(path) {
  for (const suffix of ['', '-wal', '-shm', '-journal', '.instance-lock.sqlite']) {
    const entry = lstatSync(path + suffix, { throwIfNoEntry: false });
    if (entry && (!entry.isFile() || entry.nlink !== 1)) throw new Error(refusal);
  }
}

export function allowTransition(path, authorized = false, targetVersion = currentSchema, recovery = false) {
  if (process.env.OMEUMES_RUNTIME === 'hosted') {
    if (path !== hostedPaths().path || recovery || targetVersion !== currentSchema) throw new Error(refusal);
    if (!existsSync(path)) {
      if (authorized === initializeHosted) return;
      throw new Error('Base alojada ausente. Execute explicitamente hosted.mjs init.');
    }
    assertSingleFiles(path);
    const header = Buffer.alloc(100);
    const fd = openSync(path, 'r');
    try {
      if (
        readSync(fd, header, 0, 100, 0) === 100 &&
        header.subarray(0, 16).toString('latin1') === 'SQLite format 3\0' &&
        header.readUInt32BE(68) === 1330464083 &&
        (header.readUInt32BE(60) === targetVersion ||
          (authorized === upgradeHosted &&
            header.readUInt32BE(60) >= 9 &&
            header.readUInt32BE(60) < targetVersion))
      )
        return;
    } finally {
      closeSync(fd);
    }
    throw new Error(refusal);
  }
  const daily = resolve(/* turbopackIgnore: true */ process.cwd(), 'data', 'o-meu-mes.sqlite');
  const local =
    process.env.OMEUMES_TEST_MODE !== '1' &&
    (path === daily || recovery === true || path === process.env.OMEUMES_RELEASED_PATH);
  if (local) {
    if (
      targetVersion !== currentSchema ||
      !existsSync(path) ||
      relative(realpathSync(path), resolve(path)) !== ''
    )
      throw new Error(refusal);
    assertSingleFiles(path);
  } else {
    assertSynthetic(path);
    if (authorized && (!existsSync(path) || targetVersion < 6)) return;
  }
  // A header read does not create SQLite WAL/SHM files. Ambiguous headers fail closed.
  if (existsSync(path)) {
    const header = Buffer.alloc(100);
    const fd = openSync(path, 'r');
    try {
      if (
        readSync(fd, header, 0, 100, 0) === 100 &&
        header.subarray(0, 16).toString('latin1') === 'SQLite format 3\0' &&
        header.readUInt32BE(68) === 1330464083 &&
        (header.readUInt32BE(60) === targetVersion ||
          (!local &&
            authorized &&
            targetVersion >= 7 &&
            [6, 7, 8].includes(header.readUInt32BE(60)) &&
            header.readUInt32BE(60) < targetVersion))
      )
        return;
    } finally {
      closeSync(fd);
    }
  }
  throw new Error(refusal);
}

export function testTransitionAuthorized() {
  return process.env.OMEUMES_TEST_MODE === '1' && process.env.OMEUMES_TEST_TRANSITION === 'MU5';
}
