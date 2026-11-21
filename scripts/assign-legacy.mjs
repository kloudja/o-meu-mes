import { assignLegacy } from '../src/server/assign-legacy.mjs';
const [source,destination,userId,spaceId,...extra]=process.argv.slice(2);
try {
  if(!spaceId||extra.length)throw new Error('Indique cópia v4, base v6, GUID do utilizador e GUID do espaço (por esta ordem).');
  const result=assignLegacy(source,destination,userId,spaceId);
  console.log(result.replay?'Atribuição já confirmada.':'Atribuição confirmada.');
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
