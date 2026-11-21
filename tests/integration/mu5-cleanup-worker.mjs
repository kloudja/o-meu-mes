import { connect } from '../../src/server/storage.mjs';
import { assertSynthetic } from '../../src/server/transition.mjs';
import { maintenance } from '../../src/modules/identity/mail.mjs';
const [path, clock] = process.argv.slice(2);
assertSynthetic(path);
const db = connect(path, 5000);
process.send('ready');
process.on('message', (message) => {
  try {
    if (message === 'clean') {
      db.exec('BEGIN IMMEDIATE');
      maintenance(db, Number(clock), Buffer.from(process.env.OMEUMES_AUTH_KEY, 'base64'));
      process.send('locked');
    }
    if (message === 'commit') {
      db.exec('COMMIT');
      db.close();
      process.send('done');
      process.disconnect();
    }
  } catch {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
    process.exit(1);
  }
});
