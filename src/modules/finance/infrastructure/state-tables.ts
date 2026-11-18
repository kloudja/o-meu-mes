import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { State, Line, Event, } from '../domain/model';

import type { Confirmed } from '../contracts/command';

export type Fault=(stage:'catalog'|'initials'|'events'|'receipt'|'commit'|'response')=>void;
type Row=Record<string,SQLInputValue>;
const json=(v:unknown)=>JSON.stringify(v);
const parse=(v:unknown)=>JSON.parse(v as string);
const nullable=(s:string|undefined)=>s||null;

// Only the server's domain result reaches this function. Each row is updated in place;
// no financial record is deleted, even when a line is removed or an event is voided.
export function persist(db:DatabaseSync,s:State,fault?:Fault){
  const upsert=(table:string,keys:string[],row:Row)=>{
    const columns=Object.keys(row),values=Object.values(row);
    const existing=db.prepare(`SELECT * FROM ${table} WHERE ${keys.map(k=>`${k}=?`).join(' AND ')}`).get(...keys.map(k=>row[k]));
    if(existing&&columns.every(k=>existing[k]===row[k]))return;
    const updates=columns.filter(k=>!keys.includes(k));
    db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')}) ON CONFLICT(${keys.join(',')}) DO ${updates.length?'UPDATE SET '+updates.map(k=>`${k}=excluded.${k}`).join(','):'NOTHING'}`).run(...values);
  };
  for(const a of s.accounts){upsert('accounts',['id'],{id:a.id,payload:json(a)});upsert('origins',['id'],{id:`a:${a.id}`,account_id:a.id,reserve_id:null});}
  for(const c of s.categories)upsert('categories',['id'],{id:c.id,payload:json(c)});
  for(const r of s.reserves){upsert('reserves',['id'],{id:r.id,account_id:r.accountId,payload:json(r)});upsert('origins',['id'],{id:`r:${r.id}`,account_id:null,reserve_id:r.id});}
  const lineRow=(l:Line)=>{const {plan,...metadata}=l;return {id:l.id,account_id:nullable(l.accountId),category_id:nullable(l.categoryId),reserve_id:nullable(l.reserveId),plan,payload:json(metadata)};};
  // Base definitions have no financial history; removal here does not remove monthly copies.
  for(const row of db.prepare('SELECT id FROM base_lines').all())if(!s.base.some(l=>l.id===row.id))db.prepare('DELETE FROM base_lines WHERE id=?').run(row.id);
  for(const l of s.base)upsert('base_lines',['id'],lineRow(l));
  for(const r of s.recurring){const {amount,...metadata}=r;upsert('recurring',['id'],{id:r.id,account_id:nullable(r.accountId),reserve_id:nullable(r.reserveId),amount,payload:json(metadata)});}
  fault?.('catalog');
  const origins=[...s.accounts.map(a=>`a:${a.id}`),...s.reserves.map(r=>`r:${r.id}`)];
  for(const m of Object.values(s.months)){
    const period=m.period;upsert('months',['period'],{period});
    for(const source of origins)upsert('initials',['period','source'],{period,source,amount:m.initials[source]??null});
    for(const l of m.lines)upsert('lines',['period','id'],{period,...lineRow(l),removed:0});
    for(const l of m.removedLines??[])upsert('lines',['period','id'],{period,...lineRow(l),removed:1});
    if(m.snapshot)upsert('snapshots',['period'],{period,format:1,payload:json(m.snapshot)});
    fault?.('initials');
    for(const e of m.events){
      const {amount,purchaseAmount,corrects,replacedBy,deltas,allocations,reconciliation,totalObservation,...metadata}=e;
      upsert('events',['period','id'],{period,id:e.id,line_id:e.lineId??null,amount,purchase_amount:purchaseAmount??null,corrects:corrects??null,replaced_by:replacedBy??null,payload:json(metadata)});
      for(const [source,delta] of Object.entries(deltas))upsert('effects',['period','event_id','source'],{period,event_id:e.id,source,delta});
      if(reconciliation)upsert('observations',['period','event_id'],{period,event_id:e.id,source:reconciliation.source,observed:reconciliation.observed,calculated:reconciliation.calculated,purchases:null});
      if(totalObservation)upsert('observations',['period','event_id'],{period,event_id:e.id,source:null,observed:totalObservation.observed,calculated:totalObservation.realizedBefore,purchases:totalObservation.purchasesBefore});
    }
    // Parents may have been inserted later in the array; both sides exist now.
    for(const e of m.events)for(const [parent,amount] of Object.entries(e.allocations??{}))upsert('allocations',['period','event_id','parent_id'],{period,event_id:e.id,parent_id:parent,amount});
    for(const o of m.occurrences){const {amount,...metadata}=o;upsert('occurrences',['period','id'],{period,id:o.id,definition_id:o.definitionId,line_id:o.lineId??null,amount,payload:json(metadata)});}
  }
  fault?.('events');
  for(const [key,value] of Object.entries(s.requests)){const [scope,request_id]=JSON.parse(key);upsert('receipts',['scope','request_id'],{scope,request_id,canonical:value});}
  fault?.('receipt');
}

export function load(db:DatabaseSync,period?:string):Confirmed{
  const all=(t:string)=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
  const s:State={accounts:all('accounts').map(r=>parse(r.payload)),categories:all('categories').map(r=>parse(r.payload)),reserves:all('reserves').map(r=>parse(r.payload)),base:all('base_lines').map(r=>({...parse(r.payload),plan:r.plan})),recurring:all('recurring').map(r=>({...parse(r.payload),amount:r.amount})),selected:'',months:{},requests:{}};
  for(const r of all('months')){const p=r.period as string;s.months[p]={period:p,lines:[],removedLines:[],initials:{},events:[],occurrences:[]};}
  const month=(r:Record<string,unknown>)=>s.months[r.period as string];
  for(const r of all('lines'))(r.removed?month(r).removedLines!:month(r).lines).push({...parse(r.payload),plan:r.plan});
  for(const r of all('initials'))month(r).initials[r.source as string]=r.amount as number|null;
  for(const r of all('snapshots'))month(r).snapshot=parse(r.payload);
  if(db.prepare('PRAGMA user_version').get()!.user_version as number >= 3)
    for(const r of all('excel_imports'))month(r).excelImport=parse(r.payload);
  const event=(r:Record<string,unknown>)=>month(r).events.find(e=>e.id===r.event_id)!;
  for(const r of all('events')){
    const e:Event={...parse(r.payload),amount:r.amount,deltas:{}};
    if(r.purchase_amount!==null)e.purchaseAmount=r.purchase_amount as number;
    if(r.corrects!==null)e.corrects=r.corrects as string;
    if(r.replaced_by!==null)e.replacedBy=r.replaced_by as string;
    month(r).events.push(e);
  }
  for(const r of all('effects'))event(r).deltas[r.source as string]=r.delta as number;
  for(const r of all('allocations'))(event(r).allocations??={})[r.parent_id as string]=r.amount as number;
  for(const r of all('observations')){
    if(r.source!==null)event(r).reconciliation={source:r.source as string,observed:r.observed as number,calculated:r.calculated as number};
    else event(r).totalObservation={observed:r.observed as number,realizedBefore:r.calculated as number,purchasesBefore:r.purchases as number};
  }
  for(const r of all('occurrences'))month(r).occurrences.push({...parse(r.payload),amount:r.amount});
  for(const r of all('receipts'))s.requests[JSON.stringify([r.scope,r.request_id])]=r.canonical as string;
  s.selected=period&&s.months[period]?period:Object.keys(s.months).sort().at(-1)!;
  if(!s.selected)throw new Error('Database has no initial month');
  return {state:s,revision:db.prepare('SELECT revision FROM meta WHERE id=1').get()!.revision as number};
}

