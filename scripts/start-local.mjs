import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
if (process.argv[2] === '--restaurar') {
  await import('./restore-local.mjs');
  process.exit(process.exitCode ?? 0);
}
if(!existsSync('node_modules/next/package.json')){
  console.error('Faltam dependências. Nesta pasta, execute pnpm install --frozen-lockfile. Consulte README.md.');
  process.exit(1);
}
console.log('O meu mês. Deixe esta janela aberta enquanto utiliza a aplicação. Ctrl+C para parar.');
const result=spawnSync(process.execPath,['scripts/next.mjs','start',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
