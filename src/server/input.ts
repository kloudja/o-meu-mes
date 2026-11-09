import type { Action } from '../domain/engine';
import type { Command } from './repository';
import { DomainError, validId, validPeriod } from '../domain/validation';

type Shape=Record<string,'string'|'number'|'boolean'|'money'|'object'|ShapeSpec>;
interface ShapeSpec {shape:Shape; optional?:boolean; list?:boolean}
const opt=(shape:Shape):ShapeSpec=>({shape,optional:true});
const line:Shape={id:'string',name:'string',kind:'string',plan:'money',accountId:'string',categoryId:'string',reserveId:'string',variable:'boolean'};
const financial:Record<string,Shape>={
  execute:{type:'string',lineId:'string',amount:'number',date:'string',source:'string',complete:'boolean',total:'boolean',description:'string',initials:'object',includedInTotal:'string'},
  transfer:{type:'string',source:'string',destination:'string',amount:'number',date:'string',initials:'object'},
  reconcile:{type:'string',source:'string',amount:'number',date:'string',note:'string'}
};
const shapes:Record<string,Shape>={...financial,recordSuggestedTransfers:{type:'string',date:'string',period:'string',routes:{list:true,shape:{source:'string',destination:'string',amount:'number'}}},month:{type:'string',period:'string'},snapshot:{type:'string',date:'string'},initial:{type:'string',source:'string',amount:'number'},line:{type:'string',line:opt(line),target:'string'},removeLine:{type:'string',id:'string',target:'string'},void:{type:'string',id:'string'},correct:{type:'string',id:'string',replacement:'object'},occurrence:{type:'string',id:'string',mode:'string',lineId:'string'},account:{type:'string',account:opt({id:'string',name:'string',color:'string',restricted:'boolean',archived:'boolean'})},category:{type:'string',category:opt({id:'string',name:'string',archived:'boolean'})},reserve:{type:'string',reserve:opt({id:'string',name:'string',accountId:'string'})},recurring:{type:'string',definition:opt({id:'string',name:'string',date:'string',frequency:'string',active:'boolean',amount:'money',accountId:'string',reserveId:'string',reminderText:'string',reminderDays:'number'})}};
shapes.line.execution=opt({amount:'number',date:'string',source:'string',initials:'object',description:'string'});
shapes.save={type:'string',reserveId:'string',lineId:'string',source:'string',amount:'number',date:'string',initials:'object'};
shapes.associateSaving={type:'string',lineId:'string',eventId:'string',amount:'number'};
shapes.deleteAccount={type:'string',id:'string'};
function invalid():never{throw new DomainError('INPUT','O pedido contém campos inválidos. Reveja o formulário.');}
function object(v:unknown):v is Record<string,unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function check(v:unknown,shape:Shape){
  if(!object(v))invalid();
  for(const [k,value] of Object.entries(v)){
    if(!Object.hasOwn(shape,k))invalid();
    const type=shape[k];
    if(typeof type==='object'){
      if(type.list){
        if(!Array.isArray(value)||!value.length)invalid();
        for(const item of value){check(item,type.shape);required(item,Object.keys(type.shape));}
      }else check(value,type.shape);
      continue;
    }
    if(type==='money'&&value===null)continue;
    if(type==='object'){if(!object(value))invalid();continue;}
    if(typeof value!==(type==='money'?'number':type))invalid();
    if(typeof value==='string'&&value.length>2000)invalid();
    if(typeof value==='number'&&!Number.isSafeInteger(value))invalid();
  }
}
function required(o:Record<string,unknown>,keys:string[]){if(keys.some(k=>!Object.hasOwn(o,k)))invalid();}
export function parseAction(value:unknown):Action{
  if(!object(value)||typeof value.type!=='string'||!Object.hasOwn(shapes,value.type))invalid();
  check(value,shapes[value.type]);
  const requiredFields:Record<string,string[]>={recordSuggestedTransfers:['date','period','routes'],execute:['lineId','amount','date','source','complete'],transfer:['source','destination','amount','date'],reconcile:['source','amount','date','note'],month:['period'],snapshot:['date'],initial:['source','amount'],line:['line'],removeLine:['id'],void:['id'],correct:['id','replacement'],occurrence:['id','mode'],account:['account'],category:['category'],reserve:['reserve'],recurring:['definition']};
  requiredFields.save=['reserveId','source','amount','date'];
  requiredFields.associateSaving=['lineId','eventId','amount'];
  requiredFields.deleteAccount=['id'];
  required(value,requiredFields[value.type]);
  for(const k of ['line','account','category','reserve','definition'])if(value[k]){
    const fields:Record<string,string[]>={line:['id','name','kind','plan','accountId','categoryId'],account:['id','name','color','restricted'],category:['id','name'],reserve:['id','name','accountId'],definition:['id','name','date','frequency','active','amount','accountId']};
    required(value[k] as Record<string,unknown>,fields[k]);
  }
  if(value.target!==undefined&&value.target!=='base')invalid();
  if(value.type==='account'&&!/^#[0-9a-fA-F]{6}$/.test((value.account as {color:string}).color))invalid();
  if(value.type==='correct'){
    const a=parseAction(value.replacement);if(!['execute','transfer','reconcile'].includes(a.type))invalid();
  }
  const execution=value.execution as Record<string,unknown>|undefined;
  if(execution)required(execution,['amount','date','source']);
  const initials=value.initials??execution?.initials;
  if(initials){for(const [k,n] of Object.entries(initials)){validId(k);if(typeof n!=='number'||!Number.isSafeInteger(n))invalid();}}
  return value as unknown as Action;
}
export function parseCommand(value:unknown):Command{
  check(value,{period:'string',requestId:'string',revision:'number',action:'object'});
  const c=value as Record<string,unknown>;required(c,['period','requestId','revision','action']);
  validPeriod(c.period as string);validId(c.requestId as string);
  if((c.requestId as string).length>200||(c.revision as number)<0)invalid();
  return {...c,action:parseAction(c.action)} as unknown as Command;
}
