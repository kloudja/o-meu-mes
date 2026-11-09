import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { hashPassword } from './home-entry.mjs';

const [path] = process.argv.slice(2);
const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (password.length < 20 || password.length > 256 || /[\r\n]/.test(password)) throw new Error('Escolha uma palavra-passe de 20 a 256 caracteres, numa linha.');
const temporary = path + '.new';
writeFileSync(temporary, JSON.stringify(await hashPassword(password)), { flag: 'wx' });
renameSync(temporary, path);
