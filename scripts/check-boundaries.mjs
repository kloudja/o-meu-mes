import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { isBuiltin } from 'node:module';
import ts from 'typescript';

const root = resolve('src');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const graph = new Map();
const violations = new Set();
const local = (path) => relative(root, path).split(sep).join('/');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:tsx?|mjs)$/.test(path) ? [path] : [];
  });
}

function allowed(from, to) {
  if (from.startsWith('modules/identity/ui/')) {
    return (
      to.startsWith('modules/identity/ui/') ||
      to === 'modules/identity/contracts.ts' ||
      to.startsWith('shared/')
    );
  }
  if (from.startsWith('modules/identity/')) {
    return !/^(app\/|shared\/ui\/|modules\/(finance\/|identity\/ui\/))/.test(to);
  }
  if (from.startsWith('shared/i18n/')) return to.startsWith('shared/i18n/');
  if (from.startsWith('shared/')) return to.startsWith('shared/');
  if (from.startsWith('modules/finance/domain/')) {
    return to.startsWith('modules/finance/domain/') || to.startsWith('shared/i18n/');
  }
  if (from.startsWith('modules/finance/contracts/')) {
    return /^(modules\/finance\/(domain|contracts)\/|shared\/i18n\/)/.test(to);
  }
  if (/^modules\/finance\/(ui|i18n|client)\//.test(from)) {
    return (
      /^(modules\/finance\/(domain|ui|client|i18n|contracts)\/|shared\/)/.test(to) &&
      !to.endsWith('/command-schema.ts')
    );
  }
  if (/^(server\/|modules\/finance\/infrastructure\/)/.test(from)) {
    return !/^(app\/|shared\/ui\/|modules\/finance\/(ui|client)\/)/.test(to);
  }
  return true;
}

for (const path of sourceFiles(root)) {
  const from = local(path);
  const { importedFiles } = ts.preProcessFile(readFileSync(path, 'utf8'), true, true);
  const edges = [];
  for (const { fileName: specifier } of importedFiles) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
      const pure = /^(modules\/finance\/domain\/|shared\/i18n\/)/.test(from);
      const client = /^(modules\/finance\/(ui|client)\/|modules\/identity\/ui\/|shared\/ui\/)/.test(from);
      if (pure || (client && (isBuiltin(specifier) || specifier.startsWith('next/headers')))) {
        violations.add(`${from} → ${specifier}`);
      }
      continue;
    }
    if (specifier.endsWith('.css')) continue;
    const resolved = ts.resolveModuleName(specifier, path, options, ts.sys).resolvedModule;
    if (!resolved) {
      violations.add(`${from} → ${specifier} (unresolved)`);
      continue;
    }
    const to = local(resolved.resolvedFileName);
    edges.push(to);
    if (to.startsWith('../') || !allowed(from, to)) violations.add(`${from} → ${to}`);
  }
  graph.set(from, edges);
}

const visited = new Set();
function visit(node, parents) {
  if (parents.includes(node)) {
    violations.add([...parents.slice(parents.indexOf(node)), node].join(' → '));
    return;
  }
  if (visited.has(node)) return;
  for (const next of graph.get(node) ?? []) visit(next, [...parents, node]);
  visited.add(node);
}
for (const node of graph.keys()) visit(node, []);
for (const violation of violations) console.error(violation);
if (violations.size) process.exitCode = 1;
else console.log(`Verified import boundaries and cycles in ${graph.size} modules.`);
