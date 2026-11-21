import { createHmac } from 'node:crypto';

const payloadTables = [
  'accounts',
  'categories',
  'reserves',
  'base_lines',
  'lines',
  'events',
  'recurring',
  'occurrences',
  'snapshots',
];
const label = 'Dados pessoais removidos';
const sign = (key, space, text) =>
  createHmac('sha256', key)
    .update('redact:' + space + ':' + text)
    .digest('hex');
export const filterFor = (key, space, text) => text.length + ':' + sign(key, space, text);

// Only display text can be rewritten. IDs, dates, amounts and links are never parsed as prose.
export function redact(db, space, filter, key, needle) {
  if (!db.isTransaction) throw new Error('Transação de redação necessária.');
  const [length, hash] = filter.split(':');
  const width = Number(length);
  if (!Number.isInteger(width) || width < 1 || width > 256 || !hash) throw new Error('Filtro inválido.');
  const matches = (value) => {
    if (typeof value !== 'string') return false;
    if (needle !== undefined) return value.includes(needle);
    for (let offset = 0; offset <= value.length - width; offset++)
      if (sign(key, space, value.slice(offset, offset + width)) === hash) return true;
    return false;
  };
  function clean(object, parent = '') {
    if (!object || typeof object !== 'object') return false;
    let changed = false;
    for (const [field, value] of Object.entries(object)) {
      if (
        (['name', 'note', 'description', 'reminderText'].includes(field) || parent === 'sourceNames') &&
        matches(value)
      ) {
        object[field] = label;
        changed = true;
      } else if (clean(value, field)) changed = true;
    }
    return changed;
  }
  db.prepare("INSERT INTO privacy_gate VALUES(?,'redact')").run(space);
  for (const table of payloadTables) {
    for (const row of db.prepare('SELECT rowid,payload FROM ' + table + ' WHERE space_id=?').all(space)) {
      const data = JSON.parse(row.payload);
      if (clean(data))
        db.prepare('UPDATE ' + table + ' SET payload=? WHERE rowid=?').run(JSON.stringify(data), row.rowid);
    }
  }
  const name = db.prepare('SELECT name FROM spaces WHERE id=?').get(space)?.name;
  if (matches(name)) db.prepare('UPDATE spaces SET name=? WHERE id=?').run(label, space);
  // Import provenance and original commands are dispensable. Preserve only replay-denial keys.
  function contains(value) {
    if (typeof value === 'string') return matches(value);
    return (
      value && typeof value === 'object' && Object.entries(value).some(([k, v]) => matches(k) || contains(v))
    );
  }
  for (const row of db.prepare('SELECT rowid,payload FROM excel_imports WHERE space_id=?').all(space))
    if (contains(JSON.parse(row.payload)))
      db.prepare('DELETE FROM excel_imports WHERE rowid=?').run(row.rowid);
  for (const row of db
    .prepare('SELECT rowid,scope,canonical FROM legacy_receipts WHERE space_id=?')
    .all(space)) {
    const original = JSON.parse(row.canonical);
    if (contains(original))
      db.prepare('UPDATE legacy_receipts SET canonical=? WHERE rowid=?').run(
        JSON.stringify(row.scope === 'open' ? { period: original.period, retired: true } : { retired: true }),
        row.rowid,
      );
  }
  db.prepare('UPDATE meta SET revision=revision+1,mu3_start=revision+1 WHERE space_id=?').run(space);
  db.prepare('DELETE FROM privacy_gate WHERE space_id=?').run(space);
  return matches;
}
