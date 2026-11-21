import { aid, rid, type State, type Month, type Line, type Event } from './model';
import { sum, knownSum, fail } from './validation';

export const reversedIds=(m:Month)=>new Set(m.events.flatMap(e=>e.reverses?[e.reverses]:[]));
export function activeEvents(m:Month){
  const reversed=reversedIds(m);
  return m.events.filter(e=>!e.voided&&!e.reverses&&!reversed.has(e.id));
}
function ledgerEvents(m:Month){
  const reversed=reversedIds(m);
  // Unconverted fixtures can still contain old annulments without an inverse.
  return m.events.filter(e=>!e.voided||reversed.has(e.id));
}
export const realized=(m:Month,id:string)=>sum(ledgerEvents(m).filter(e=>e.lineId===id).map(e=>e.amount));
export function completed(m:Month,id:string){
  const line=m.lines.find(l=>l.id===id);
  const events=activeEvents(m).filter(e=>e.lineId===id&&
    (line?.kind!=='expense'||e.line?.expenseModeRevision===line.expenseModeRevision));
  return events.some(e=>e.complete)||(
    line?.kind==='expense'&&!line.variable&&line.plan!==null&&
    events.some(e=>e.type==='execution')&&realized(m,id)>=line.plan
  );
}
export const pending=(m:Month,l:Line)=>completed(m,l.id)?0:l.plan==null?null:Math.max(0,sum([l.plan,-realized(m,l.id)]));
export const effects=(m:Month,source:string)=>sum(ledgerEvents(m).map(e=>e.deltas[source]??0));
export const balance=(m:Month,source:string)=>m.initials[source]==null?null:sum([m.initials[source]!,effects(m,source)]);
export const initialPlan=(m:Month,l:Line)=>{if(!m.snapshot)return null;const original=m.snapshot.lines.find(x=>x.id===l.id);return original?original.plan:0;};
export const plannedSource=(l:Line)=>l.kind==='expense'&&l.reserveId?rid(l.reserveId):aid(l.accountId);
export const planTotal=(m:Month,kind:Line['kind'])=>sum(m.lines.filter(l=>l.kind===kind).map(l=>l.plan??0));
export const obligations=(m:Month,source:string)=>knownSum(m.lines.filter(l=>l.kind!=='income'&&plannedSource(l)===source).map(l=>pending(m,l)));
export const budgetRemainders=(m:Month)=>m.lines.filter(l=>l.kind==='expense'&&l.variable).map(line=>{
  const spent=realized(m,line.id);
  return {line,spent,remaining:line.plan===null?null:sum([line.plan,-spent])};
});
export const budgetRemainder=(m:Month)=>knownSum(budgetRemainders(m).map(row=>row.remaining));
export function canDeleteAccount(s:State,id:string){
  if(s.usedAccounts?.includes(id))return false;
  const source=aid(id);
  const usesAccount=(entry:{accountId:string})=>entry.accountId===id;
  return !s.reserves.some(usesAccount)&&!s.base.some(usesAccount)&&!s.recurring.some(usesAccount)&&
    !Object.values(s.months).some(m=>m.initials[source]!=null||m.lines.some(usesAccount)||
      m.removedLines?.some(usesAccount)||m.snapshot?.lines.some(usesAccount)||m.occurrences.some(usesAccount)||
      m.events.some(e=>Object.hasOwn(e.deltas,source)||e.line?.accountId===id||e.reconciliation?.source===source));
}
export const occurrenceLineId=(id:string)=>`occ:${id}`;
export const linkableExpenses=(m:Month)=>m.lines.filter(l=>l.kind==='expense'&&!m.occurrences.some(o=>o.lineId===l.id));
export const savingPending=(m:Month,reserveId:string)=>knownSum(m.lines.filter(l=>l.kind==='saving'&&l.reserveId===reserveId).map(l=>pending(m,l)));
export const savingGoals=(m:Month,reserveId:string)=>m.lines.filter(l=>l.kind==='saving'&&l.reserveId===reserveId);
export const savingProgress=(m:Month,reserveId:string)=>{
  const goals=savingGoals(m,reserveId);
  return {target:goals.length?knownSum(goals.map(l=>l.plan)):null,
    saved:sum(goals.map(l=>realized(m,l.id))),remaining:goals.length?savingPending(m,reserveId):null};
};
export function freeSaving(m:Month,e:Event,reserveId:string){
  if(e.voided||e.reverses||reversedIds(m).has(e.id))return 0;
  const extra=e.saving?.reserveId===reserveId?e.saving.extra:e.type==='transfer'?Math.max(0,e.deltas[rid(reserveId)]??0):0;
  return extra?sum([extra,...activeEvents(m).filter(x=>x.savingParentId===e.id).map(x=>-x.amount)]):0;
}
export function previousPeriod(period:string){
  const [year,month]=period.split('-').map(Number);
  const preceding=month===1?`${String(year-1).padStart(4,'0')}-12`:`${period.slice(0,5)}${String(month-1).padStart(2,'0')}`;
  return preceding;
}
export function precedingMonth(s:State,period:string):Month|undefined{
  return s.months[previousPeriod(period)];
}
export function previousSavingBalance(s:State,m:Month,reserveId:string){
  const previous=precedingMonth(s,m.period);
  if(!previous){
    const prior=s.previousBalances;
    const amount=prior?.balances[rid(reserveId)];
    return prior?.period===previousPeriod(m.period)&&amount!=null?{period:prior.period,amount}:null;
  }
  const amount=balance(previous,rid(reserveId));
  return amount===null?null:{period:previous.period,amount};
}
export const defaultReserveInitial=(s:State,m:Month,reserveId:string)=>previousSavingBalance(s,m,reserveId)?.amount??0;
export function reserveUse(m:Month,reserveId:string){
  const source=rid(reserveId),events=activeEvents(m);
  const spent=sum(events.filter(e=>Object.hasOwn(e.deltas,source)&&(e.type==='execution'||e.type==='total')&&
    (e.line??m.lines.find(line=>line.id===e.lineId)??m.removedLines?.find(line=>line.id===e.lineId))?.kind==='expense').map(e=>-e.deltas[source]));
  const returned=-sum(events.filter(e=>e.type==='transfer'&&(e.deltas[source]??0)<0).map(e=>e.deltas[source]));
  return {spent,withdrawn:sum([spent,returned])};
}
export function sourceTotals(s:State,m:Month,source?:string){
  const keys=[...s.accounts.map(a=>aid(a.id)),...s.reserves.map(r=>rid(r.id))];
  return {reserved:sum(s.reserves.map(r=>balance(m,rid(r.id))??0)),wealth:sum(keys.map(k=>balance(m,k)??0)),
    incoming:sum(activeEvents(m).map(e=>Math.max(0,e.deltas[source??'']??0))),
    outgoing:sum(activeEvents(m).map(e=>Math.max(0,-(e.deltas[source??'']??0))))};
}
export function summary(s:State,m:Month) {
  const keys=s.accounts.filter(a=>!a.restricted).map(a=>aid(a.id));
  const available=sum(keys.map(k=>balance(m,k)??0));
  const expenses=knownSum(m.lines.filter(l=>l.kind==='expense').map(l=>pending(m,l)));
  const savings=knownSum(m.lines.filter(l=>l.kind==='saving'||l.kind==='investment').map(l=>pending(m,l)));
  const committed=knownSum(keys.map(k=>obligations(m,k)));
  const unassigned=m.lines.some(l=>l.kind!=='income'&&!l.reserveId&&!s.accounts.some(a=>a.id===l.accountId));
  return {available,expenses,savings,free:committed==null||unassigned?null:sum([available,-committed]),incomplete:keys.some(k=>balance(m,k)==null)||expenses==null||savings==null||unassigned,leftover:budgetRemainder(m)};
}
export const totalUnallocated=(m:Month,e:Event)=>sum([e.amount,...activeEvents(m).map(x=>-(x.allocations?.[e.id]??0))]);
export function accumulatedTotal(m:Month,lineId:string,observed:number,source?:string,reference?:Event['totalObservation']){
  const purchasesBefore=reference?.purchasesBefore??sum(activeEvents(m).filter(e=>e.lineId===lineId&&(e.type==='execution'||e.type==='detail')).map(e=>e.purchaseAmount??e.amount));
  if(observed<purchasesBefore)fail('TOTAL_BELOW_PURCHASES','O total é inferior às compras conhecidas. Aumente o total ou corrija as compras no detalhe.');
  const realizedBefore=reference?.realizedBefore??realized(m,lineId);
  const adjustment=sum([observed,-realizedBefore]);
  const allocations:Record<string,number>={};
  if(source&&adjustment<0){
    let remaining=-adjustment;
    for(const e of activeEvents(m).filter(e=>e.lineId===lineId&&e.type==='total'&&e.amount>0&&e.deltas[source]===-e.amount).reverse()){
      const take=Math.min(remaining,totalUnallocated(m,e));
      if(take>0)allocations[e.id]=take;
      remaining-=take;
      if(!remaining)break;
    }
    if(remaining)fail('TOTAL_SOURCE','Esta origem não financiou ajuste suficiente para a redução. Escolha a origem do ajuste ou corrija os registos no detalhe.');
  }
  return {observation:{observed,realizedBefore,purchasesBefore},adjustment,allocations};
}
