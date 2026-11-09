import { Repository } from './repository';
import { parseCommand } from './input';
import { DomainError } from '../domain/validation';
import { accessMode, writeAccess } from './access';

export function errorResponse(error:unknown){
  if(error instanceof DomainError)return Response.json({code:error.code,message:error.message},{status:error.code==='CONFLICT'?409:422});
  // No commands, monetary data, paths or stacks in ordinary product logs.
  const e=error as {code?:string;name?:string;errcode?:number};
  console.error('Armazenamento local indisponível',{code:e.code??e.name,sqlite:e.errcode});
  return Response.json({code:'STORAGE',message:'Não foi possível confirmar a gravação local. Os dados confirmados mantêm-se. Verifique o servidor e repita a mesma tentativa com segurança.'},{status:503});
}
export async function handleGet(request:Request,repo?:Repository){
  if(!accessMode(request.headers))return Response.json({message:'Acesso indisponível.'},{status:403,headers:{'Cache-Control':'no-store'}});
  try{return Response.json((repo??new Repository()).read(new URL(request.url).searchParams.get('period')??undefined),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}
}
export async function handlePost(request:Request,repo?:Repository){
  try{
    if(!writeAccess(request))return Response.json({code:'ORIGIN',message:'Este pedido deve ser feito na origem da aplicação.'},{status:403});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({code:'INPUT',message:'Formato de pedido inválido.'},{status:415});
    const content=await request.text();if(content.length>32000)return Response.json({code:'INPUT',message:'O pedido é demasiado extenso.'},{status:413});
    let body;try{body=JSON.parse(content);}catch{throw new DomainError('INPUT','O pedido não é válido.');}
    const result=(repo??new Repository()).command(parseCommand(body));
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
