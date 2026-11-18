import { type State, type Line, type Recurring } from './model';
import { type TransferRoute } from './funding';

type MovementEntry = {amount:number;date:string;source:string;initials?:Record<string,number>;complete?:boolean};
export type Execution = MovementEntry & {type:'execute';lineId:string;complete:boolean;total?:boolean;description?:string;includedInTotal?:string;reserveAfter?:number};
export type SavingEntry = MovementEntry & {type:'save';reserveId:string;lineId?:string};
export type FinancialAction = Execution
 | {type:'reconcile';source:string;amount:number;date:string;note:string}
 | {type:'transfer';source:string;destination:string;amount:number;date:string;initials?:Record<string,number>};
export type Action = FinancialAction
 | {type:'month';period:string} | {type:'snapshot';date:string}
 | {type:'recordSuggestedTransfers';date:string;period:string;routes:TransferRoute[]}
 | {type:'line';line:Line;target?:'base';execution?:Pick<Execution,'amount'|'date'|'source'|'initials'|'description'|'reserveAfter'>} | {type:'removeLine';id:string;target?:'base'}
 | SavingEntry
 | {type:'associateSaving';lineId:string;eventId:string;amount:number}
 | {type:'initial';source:string;amount:number} | {type:'void';id:string}
 | {type:'correct';id:string;replacement:FinancialAction}
 | {type:'occurrence';id:string;mode:'add'|'link'|'dismiss';lineId?:string}
 | {type:'recurring';definition:Recurring} | {type:'account';account:State['accounts'][number]} | {type:'category';category:State['categories'][number]}
 | {type:'deleteAccount';id:string}
 | {type:'reserve';reserve:State['reserves'][number]};

// Sorting keys makes object-property order irrelevant for retries. Undefined is omitted.
export function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
