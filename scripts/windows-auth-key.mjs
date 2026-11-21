import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';

const preamble = [
  "$ErrorActionPreference='Stop'",
  'Add-Type -AssemblyName System.Security',
  '$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser',
  '$data=[Convert]::FromBase64String([Console]::In.ReadToEnd())',
].join(';');

function transform(operation, input) {
  if (process.platform !== 'win32') throw new Error('A chave local requer o perfil Windows que a criou.');
  const command = preamble +
    ';[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::' +
    operation + '($data,$null,$scope)))';
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
    input: input.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  if (result.status !== 0 || !result.stdout)
    throw new Error('Não foi possível aceder à chave privada deste perfil Windows.');
  return Buffer.from(result.stdout.trim(), 'base64');
}

export function writeWindowsAuthKey(path, key) {
  if (key.length !== 32) throw new Error('A chave de identidade tem de ter 32 bytes.');
  writeFileSync(path, transform('Protect', key), {flag:'wx',mode:0o600,flush:true});
}

export function readWindowsAuthKey(path) {
  const file = lstatSync(path);
  if (!file.isFile() || file.nlink !== 1) throw new Error('Ficheiro de chave local inválido.');
  const key = transform('Unprotect', readFileSync(path));
  if (key.length !== 32) throw new Error('Chave privada inválida.');
  return key.toString('base64');
}
