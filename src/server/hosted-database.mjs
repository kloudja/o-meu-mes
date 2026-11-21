import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { connect, migrate } from './storage.mjs';
import { hostedSettings, initializeHosted, upgradeHosted } from './hosted-config.mjs';
import { currentSchema, allowTransition } from './transition.mjs';
import { provisionRegistry } from './recovery-registry.mjs';

export function checkHostedDatabase(path) {
  allowTransition(path);
  const db = connect(path, 5000);
  try {
    if (
      db.prepare('PRAGMA user_version').get().user_version !== currentSchema ||
      db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length ||
      db.prepare('SELECT restored FROM identity_control').get().restored !== 0 ||
      db.prepare('SELECT registered FROM privacy_control').get().registered !== 1
    )
      throw new Error('A base alojada não está pronta ou está em quarentena.');
    db.exec('BEGIN IMMEDIATE; ROLLBACK;');
  } finally {
    db.close();
  }
}

export function initializeHostedDatabase() {
  const { path, registry } = hostedSettings();
  if (existsSync(path) || existsSync(registry))
    throw new Error('A inicialização exige base e autoridade novas.');
  migrate(path, undefined, initializeHosted);
  const db = connect(path);
  try {
    for (const table of ['users', 'spaces', 'months', 'accounts', 'events'])
      if (db.prepare('SELECT 1 FROM ' + table + ' LIMIT 1').get())
        throw new Error('A base nova não está vazia.');
    provisionRegistry(db, path);
  } finally {
    db.close();
  }
  checkHostedDatabase(path);
}

export function prepareHostedDatabase() {
  const { path } = hostedSettings();
  if (!existsSync(path)) throw new Error('Execute init antes do primeiro deployment.');
  const probe = new DatabaseSync(path, { readOnly: true });
  let version;
  try {
    version = probe.prepare('PRAGMA user_version').get().user_version;
  } finally {
    probe.close();
  }
  // The deployment supervisor takes a stopped, paired DB/authority snapshot first.
  if (version !== currentSchema) {
    if (process.env.OMEUMES_OFFLINE_SNAPSHOT !== 'confirmed')
      throw new Error('Migração exige snapshot offline da base e autoridade.');
    migrate(path, undefined, upgradeHosted);
  }
  checkHostedDatabase(path);
}
