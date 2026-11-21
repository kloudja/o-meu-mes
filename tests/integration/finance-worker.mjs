// Exercise the retained financial repository across processes without exposing a financial HTTP route.
import { registerHooks } from 'node:module';
import { assertSynthetic } from '../../src/server/transition.mjs';
registerHooks({resolve(specifier, context, next) {
  if(specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier+'.ts',context);
  return next(specifier,context);
}});
assertSynthetic(process.argv[2]);
const { Repository }=await import('../legacy/repository.ts');
const repo=new Repository(process.argv[2]);
process.on('message',({id,command,period})=>{
  try { process.send({id,status:200,data:command?repo.command(command):repo.read(period)}); }
  catch (error) { process.send({id,status:error.code==='CONFLICT'?409:422,data:{message:error.message}}); }
});
