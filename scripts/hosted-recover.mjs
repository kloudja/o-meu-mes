// Explicit recovery only, with both app and background jobs stopped.
import { fileURLToPath } from 'node:url';
import { hostedSettings } from '../src/server/hosted-config.mjs';
import { connect, migrate } from '../src/server/storage.mjs';
import { restoreBackup } from '../src/server/local-files.mjs';
import { reconcile } from '../src/server/recovery-registry.mjs';
import { checkHostedDatabase } from '../src/server/hosted-database.mjs';
import { lockDatabase } from './instance-lock.mjs';

process.umask(0o077);
process.env.OMEUMES_PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const [source, destination, ...extra] = process.argv.slice(2);
if (!source || !destination || extra.length)
  throw new Error('Indique backup e destino novo, ambos absolutos.');
const { path, config } = hostedSettings();
hostedSettings({ ...process.env, OMEUMES_DB_PATH: destination });
const activeLock = lockDatabase(path);
let recoveryLock;
try {
  await restoreBackup(source, destination, path);
  recoveryLock = lockDatabase(destination);
  process.env.OMEUMES_DB_PATH = destination;
  migrate(destination);
  const db = connect(destination);
  try {
    reconcile(db, destination, config.key);
  } finally {
    db.close();
  }
  checkHostedDatabase(destination);
  console.log('Reconciliação concluída. Configure OMEUMES_DB_PATH=' + destination + ' antes de arrancar.');
} finally {
  recoveryLock?.close();
  activeLock.close();
}
