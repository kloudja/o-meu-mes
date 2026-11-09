import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalFileError, recoveryPaths, restoreBackup } from '../src/server/local-files.mjs';

const input = createInterface({ input: process.stdin, output: process.stdout });
const lines = input[Symbol.asyncIterator]();
async function ask(prompt) {
  process.stdout.write(prompt);
  const answer = await lines.next();
  if (answer.done) throw new LocalFileError('Restauro cancelado.');
  return answer.value.trim();
}
const unquote = value => value.replace(/^"(.*)"$/, '$1');
let openPath;
try {
  console.log('O meu mês — Restaurar para outro ficheiro');
  console.log('Para copiar um caminho no Explorador, selecione o ficheiro e prima Ctrl+Shift+C.');
  const source = unquote(await ask('Caminho completo do backup SQLite: '));
  const date = new Date().toISOString().slice(0, 10);
  const suggested = join(dirname(source), `recuperado-${date}-${randomUUID().slice(0, 8)}.sqlite`);
  console.log(`Destino sugerido: ${suggested}`);
  const destination = unquote(await ask('Prima Enter para usar este destino ou indique outro caminho completo: ')) || suggested;
  const paths = recoveryPaths(source, destination);
  console.log(`\nOrigem:  ${paths.source}\nDestino: ${paths.destination}\n`);
  if (!/^s(im)?$/i.test(await ask('Confirmar restauro? [s/N] '))) {
    console.log('Restauro cancelado.');
  } else {
    console.log('A copiar e verificar…');
    await restoreBackup(paths.source, paths.destination);
    console.log(`Restauro verificado: ${paths.destination}`);
    console.log('Para regressar à base habitual, pare a cópia com Ctrl+C e abra Iniciar.cmd.');
    if (/^s(im)?$/i.test(await ask('Abrir a cópia agora? [s/N] '))) openPath = paths.destination;
    else console.log('Para abrir a cópia mais tarde, use Iniciar.cmd --base seguido do caminho entre aspas.');
  }
} catch (error) {
  const message = error instanceof LocalFileError ? error.message : error.errcode
    ? 'O SQLite não conseguiu ler ou verificar o ficheiro. Escolha outro backup.'
    : 'Verifique os caminhos, o espaço livre e a permissão de escrita numa pasta privada em NTFS.';
  console.error(`\nRestauro interrompido. ${message}`);
  process.exitCode = 1;
} finally { input.close(); }

if (openPath) {
  const result = spawnSync(process.execPath, ['scripts/start-local.mjs', '--base', openPath], {
    stdio: 'inherit', windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
}
