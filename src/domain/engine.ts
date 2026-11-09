import { aid, rid, type State, type Month, type Line, type Event, type Recurring } from './model';
import { amount, sum, knownSum, fail, validDate, validPeriod, validId, validName, daysInMonth } from './validation';
import { accountFunding, transferRoutes, type TransferRoute } from './funding';
import { money } from './money';
export { DomainError } from './validation';
export const activeEvents=(m:Month)=>m.events.filter(e=>!e.voided);
export const realized=(m:Month,id:string)=>sum(activeEvents(m).filter(e=>e.lineId===id).map(e=>e.amount));
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
export const effects=(m:Month,source:string)=>sum(activeEvents(m).map(e=>e.deltas[source]??0));
export const balance=(m:Month,source:string)=>m.initials[source]==null?null:sum([m.initials[source]!,effects(m,source)]);
export const initialPlan=(m:Month,l:Line)=>{if(!m.snapshot)return null;const original=m.snapshot.lines.find(x=>x.id===l.id);return original?original.plan:0;};
export const plannedSource=(l:Line)=>l.kind==='expense'&&l.reserveId?rid(l.reserveId):aid(l.accountId);
export const planTotal=(m:Month,kind:Line['kind'])=>sum(m.lines.filter(l=>l.kind===kind).map(l=>l.plan??0));
export const obligations=(m:Month,source:string)=>knownSum(m.lines.filter(l=>l.kind!=='income'&&plannedSource(l)===source).map(l=>pending(m,l)));
export const budgetRemainder=(m:Month)=>knownSum(m.lines.filter(l=>l.kind==='expense'&&l.variable).map(l=>l.plan==null?null:sum([l.plan,-realized(m,l.id)])));
export function canDeleteAccount(s:State,id:string){
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
  if(e.voided)return 0;
  const extra=e.saving?.reserveId===reserveId?e.saving.extra:e.type==='transfer'?Math.max(0,e.deltas[rid(reserveId)]??0):0;
  return extra?sum([extra,...activeEvents(m).filter(x=>x.savingParentId===e.id).map(x=>-x.amount)]):0;
}
export function previousSavingBalance(s:State,m:Month,reserveId:string){
  const [year,month]=m.period.split('-').map(Number);
  const period=month===1?`${String(year-1).padStart(4,'0')}-12`:`${m.period.slice(0,5)}${String(month-1).padStart(2,'0')}`;
  const previous=s.months[period];
  const amount=previous?balance(previous,rid(reserveId)):null;
  return amount===null?null:{period,amount};
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
export function dueDate(r:Recurring,period:string) {
  validPeriod(period);validDate(r.date);
  if(!['monthly','annual'].includes(r.frequency))fail('FREQUENCY','Periodicidade inválida.');
  if(r.frequency==='annual'&&r.date.slice(5,7)!==period.slice(5))return null;
  const [year,month]=period.split('-').map(Number);
  return `${period}-${String(Math.min(Number(r.date.slice(8)),daysInMonth(year,month))).padStart(2,'0')}`;
}
export function newMonth(s:State,period:string):Month {
  validPeriod(period);
  return {period,lines:structuredClone(s.base),removedLines:[],initials:Object.fromEntries([...s.accounts.map(a=>aid(a.id)),...s.reserves.map(r=>rid(r.id))].map(k=>[k,null])),events:[],occurrences:s.recurring.filter(r=>r.active).flatMap(r=>{const date=dueDate(r,period);return date?[{id:`${r.id}:${period}`,definitionId:r.id,name:r.name,date,amount:r.amount,accountId:r.accountId,reserveId:r.reserveId,state:'open' as const}]:[];})};
}
type Execution = {type:'execute';lineId:string;amount:number;date:string;source:string;complete:boolean;total?:boolean;description?:string;initials?:Record<string,number>;includedInTotal?:string};
export type FinancialAction = Execution
 | {type:'reconcile';source:string;amount:number;date:string;note:string}
 | {type:'transfer';source:string;destination:string;amount:number;date:string;initials?:Record<string,number>};
export type Action = FinancialAction
 | {type:'month';period:string} | {type:'snapshot';date:string}
 | {type:'recordSuggestedTransfers';date:string;period:string;routes:TransferRoute[]}
 | {type:'line';line:Line;target?:'base';execution?:Pick<Execution,'amount'|'date'|'source'|'initials'|'description'>} | {type:'removeLine';id:string;target?:'base'}
 | {type:'save';reserveId:string;lineId?:string;source:string;amount:number;date:string;initials?:Record<string,number>}
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
function validateResult(s:State,m:Month){
  for(const source of Object.keys(m.initials)){const b=balance(m,source);if(b!=null&&b<0)fail('DEPENDENCY','Esta operação deixaria a origem negativa. Anule primeiro a utilização ou transferência relacionada.');}
  for(const e of activeEvents(m))for(const [id,n] of Object.entries(e.allocations??{})){
    const parent=activeEvents(m).find(p=>p.id===id&&p.type==='total'&&p.amount>0&&p.lineId===e.lineId);
    if(!parent||n<=0||totalUnallocated(m,parent)<0)fail('DEPENDENCY','Este ajuste tem detalhes ou reduções dependentes. Anule primeiro esses registos.');
  }
  for(const l of m.lines){if(realized(m,l.id)<0)fail('DEPENDENCY','A anulação deixaria o gasto negativo. Corrija primeiro os ajustes dependentes.');pending(m,l);}
  summary(s,m);
  for(const kind of ['expense','income','saving','investment'] as const)planTotal(m,kind);
  for(const source of Object.keys(m.initials))sourceTotals(s,m,source);
  // Validate all visible aggregate balances as well as each origin separately.
  sum([...s.accounts.map(a=>aid(a.id)),...s.reserves.map(r=>rid(r.id))].map(k=>balance(m,k)??0));
}
export function transact(state:State,action:Action,requestId:string):State {
  validId(requestId);
  const scope=action.type==='month'?'open':state.selected;
  const key=JSON.stringify([scope,requestId]),fingerprint=canonical(action);
  if(Object.hasOwn(state.requests,key)){
    if(state.requests[key]!==fingerprint)fail('IDEMPOTENCY','Esta chave de confirmação já foi usada com conteúdo diferente. Inicie um novo registo.');
    return state;
  }
  const s=structuredClone(state), command=structuredClone(action);
  const m=s.months[s.selected];
  if(!m)fail('MONTH','Mês selecionado inexistente.');
  const sourceInfo=(source:string,destination=false)=>{
    const account=s.accounts.find(a=>aid(a.id)===source),reserve=s.reserves.find(r=>rid(r.id)===source);
    if(!account&&!reserve)fail(destination?'DESTINATION':'SOURCE',destination?'Escolha um destino válido.':'Escolha uma origem válida.');
    return {account,reserve};
  };
  const sourceLabel=(source:string)=>{const {account,reserve}=sourceInfo(source);return account?.name??reserve!.name;};
  const knownBalance=(source:string,code='INITIAL')=>{
    const b=balance(m,source);
    if(b==null)fail(code,`${sourceLabel(source)}: saldo por indicar. Se começou a zero, indique 0,00 €.`);
    return b;
  };
  const requireFunds=(source:string,n:number,verb='registar este movimento')=>{
    const current=knownBalance(source);
    if(current<n)fail('FUNDS',`${sourceLabel(source)} tem ${money(current)} disponíveis. Para ${verb} ${money(n)}, faltam ${money(n-current)}. Escolha ${verb==='poupar'?'outro banco':'outra origem'} ou reduza o montante.`);
  };
  const unrestricted=(source:string)=>{if(sourceInfo(source).account?.restricted)fail('RESTRICTED','Uma conta restrita só financia despesas com uma política de elegibilidade explícita; essa utilização não está disponível nesta fase.');};
  const applyInitials=(initials:Record<string,number>|undefined,allowed:string[])=>{
    for(const [source,n] of Object.entries(initials??{})){
      if(!allowed.includes(source))fail('INITIAL_SCOPE','Este saldo inicial não pertence à operação.');
      sourceInfo(source);amount(n);
      if(m.initials[source]!=null)fail('INITIAL_EXISTS','Saldo inicial já indicado. Utilize Conferir para registar uma diferença.');
      m.initials[source]=n;
    }
  };
  const event=(e:Omit<Event,'id'>,id=requestId)=>{
    if(m.events.some(existing=>existing.id===id))fail('IDEMPOTENCY','Já existe um registo com esta chave. Inicie um novo registo.');
    const sourceNames=Object.fromEntries(Object.keys(e.deltas).map(k=>{const info=sourceInfo(k);return [k,info.account?.name??`Reserva · ${info.reserve!.name}`];}));
    m.events.push({...e,id,sourceNames,line:structuredClone(e.line??(e.lineId?m.lines.find(l=>l.id===e.lineId):undefined))});
  };
  const validateLine=(l:Line,old?:Line)=>{
    validId(l.id);validName(l.name);if(l.plan!==null)amount(l.plan);
    if(!['expense','income','saving','investment'].includes(l.kind))fail('KIND','Tipo de movimento inválido.');
    const a=s.accounts.find(a=>a.id===l.accountId),c=s.categories.find(c=>c.id===l.categoryId);
    if(l.accountId&&(!a||(a.archived&&old?.accountId!==a.id)))fail('ACCOUNT','Escolha uma conta válida e não arquivada.');
    if(l.categoryId&&(!c||(c.archived&&old?.categoryId!==c.id)))fail('CATEGORY','Escolha uma categoria válida e não arquivada.');
    if(l.variable&&l.kind!=='expense')fail('VARIABLE','Só uma despesa permite compras e total acumulado.');
    if(l.reserveId){const r=s.reserves.find(r=>r.id===l.reserveId);if(!r||r.accountId!==l.accountId||a?.restricted||(l.kind!=='expense'&&l.kind!=='saving'))fail('RESERVE','A reserva deve pertencer à conta principal e só se aplica a despesas ou reforços.');}
    if(l.kind==='saving'&&!l.reserveId)fail('RESERVE','Escolha a reserva de destino.');
  };
  const voidEvent=(id:string)=>{const e=m.events.find(e=>e.id===id);if(!e||e.voided)fail('EVENT','Este registo já não está ativo.');e.voided=true;return e;};
  const financial=(a:FinancialAction,correction?:Event,id=requestId)=>{
    amount(a.amount);validDate(a.date,m.period);sourceInfo(a.source);
    if(a.type==='reconcile'){
      const current=knownBalance(a.source);if(!a.note.trim())fail('NOTE','Indique o motivo da diferença.');
      // Editing an observation must not absorb transactions registered after it.
      const b=correction?.reconciliation?.source===a.source?correction.reconciliation.calculated:current;
      event({amount:0,date:a.date,note:a.note.trim(),type:'adjustment',deltas:{[a.source]:sum([a.amount,-b])},reconciliation:{source:a.source,calculated:b,observed:a.amount}});return;
    }
    unrestricted(a.source);
    if(a.type==='transfer'){
      const from=sourceInfo(a.source),to=sourceInfo(a.destination,true);
      if(to.account?.restricted)fail('DESTINATION','Escolha uma conta de destino sem restrições.');
      if(a.amount===0)fail('AMOUNT','Indique um montante superior a zero.');
      if(a.source===a.destination)fail('DESTINATION','O destino deve ser diferente da origem.');
      if((from.reserve&&a.destination!==aid(from.reserve.accountId))||(to.reserve&&a.source!==aid(to.reserve.accountId)))fail('DESTINATION','Uma reserva transfere apenas para ou da sua conta principal. Registe a devolução antes de transferir para outra conta.');
      applyInitials(a.initials,[a.source,a.destination]);requireFunds(a.source,a.amount);
      knownBalance(a.destination,'DESTINATION');
      event({amount:0,date:a.date,note:'Transferência própria (sem receita nem despesa)',type:'transfer',deltas:{[a.source]:-a.amount,[a.destination]:a.amount}},id);return;
    }
    const currentLine=m.lines.find(l=>l.id===a.lineId);if(!currentLine)fail('LINE','Movimento não encontrado.');
    const l=correction?.line??currentLine;
    if(!correction&&completed(m,l.id))fail('COMPLETE','Este movimento está concluído. Anule o registo para corrigir.');
    if(typeof a.complete!=='boolean'||(a.total!==undefined&&typeof a.total!=='boolean'))fail('COMMAND','Confirmação inválida.');
    if(l.kind==='income'&&sourceInfo(a.source).reserve)fail('SOURCE','Recebimentos entram numa conta principal, não diretamente numa reserva.');
    if(l.kind==='investment'&&sourceInfo(a.source).reserve)fail('SOURCE','O investimento sai de uma conta principal.');
    if(l.kind==='saving'){
      if(a.source!==aid(l.accountId))fail('SOURCE','O reforço deve sair da conta principal indicada.');
      const r=s.reserves.find(r=>r.id===l.reserveId);
      if(!r||r.accountId!==l.accountId)fail('RESERVE','Escolha uma reserva válida da conta principal indicada.');
    }
    applyInitials(a.initials,[a.source,...(l.kind==='saving'?[rid(l.reserveId!)]:[])]);
    knownBalance(a.source);if(l.kind==='saving')knownBalance(rid(l.reserveId!));
    let n=a.amount;
    let allocations:Record<string,number>={};
    let totalObservation:Event['totalObservation'];
    if(a.includedInTotal!==undefined){
      validId(a.includedInTotal);
      if(!l.variable||l.kind!=='expense'||a.total||a.complete||n===0)fail('DETAIL','O detalhe deve ser uma compra positiva de um orçamento, sem concluir nem atualizar o total.');
      const parent=activeEvents(m).find(e=>e.id===a.includedInTotal&&e.lineId===l.id&&e.type==='total'&&e.amount>0);
      if(!parent||parent.deltas[a.source]!==-parent.amount||totalUnallocated(m,parent)<n)fail('DETAIL','Escolha um ajuste com parcela por detalhar suficiente, financiado pela mesma origem.');
      event({lineId:l.id,line:l,amount:0,purchaseAmount:n,date:a.date,description:a.description?.trim()||undefined,note:'Compra já incluída no total (sem novo gasto)',type:'detail',deltas:{[a.source]:0},allocations:{[parent.id]:n}});return;
    }
    if(a.total){
      if(!l.variable||l.kind!=='expense')fail('TOTAL','Este movimento não permite total acumulado.');
      const total=accumulatedTotal(m,l.id,n,a.source,correction?.totalObservation);
      totalObservation=total.observation;
      n=total.adjustment;
      allocations=total.allocations;
    }
    if(n===0&&!a.complete){if(a.total)return;fail('AMOUNT','Indique um montante superior a zero ou conclua explicitamente por zero.');}
    if(l.kind!=='income'&&n>0)requireFunds(a.source,n,l.kind==='expense'?'pagar':'registar');
    const deltas:Record<string,number>={[a.source]:l.kind==='income'?n:-n};
    if(l.kind==='saving')deltas[rid(l.reserveId!)]=n;
    event({lineId:l.id,line:l,amount:n,date:a.date,description:l.kind==='expense'&&!a.total?a.description?.trim()||undefined:undefined,note:a.total?'Ajuste conciliado do total acumulado':l.kind==='saving'?'Reforço de poupança':l.kind==='investment'?'Aplicação em investimento':l.kind==='income'?'Recebimento':'Pagamento / compra',type:a.total?'total':'execution',deltas,complete:a.complete,allocations,totalObservation},id);
  };
  switch(command.type){
    case 'month': validPeriod(command.period);s.months[command.period]??=newMonth(s,command.period);s.selected=command.period;break;
    case 'snapshot':{
      validDate(command.date);
      if(m.snapshot)fail('SNAPSHOT','O plano inicial já foi guardado e não pode ser substituído.');
      const reminderDates=Object.fromEntries(m.lines.flatMap(line=>{
        const reminder=m.occurrences.find(o=>o.lineId===line.id);
        return reminder?[[line.id,reminder.date]]:[];
      }));
      m.snapshot={date:command.date,lines:structuredClone(m.lines),catalog:structuredClone({accounts:s.accounts,categories:s.categories,reserves:s.reserves}),reminderDates};
      break;
    }
    case 'initial':applyInitials({[command.source]:command.amount},[command.source]);break;
    case 'line':{
      const lines=command.target==='base'?s.base:m.lines,i=lines.findIndex(l=>l.id===command.line.id),old=lines[i];validateLine(command.line,old);
      if(command.target!=='base'){
        if(m.removedLines?.some(l=>l.id===command.line.id))fail('ID','Este identificador pertence a uma linha removida. Crie uma nova linha.');
        if(old&&m.events.some(e=>e.lineId===old.id)&&(old.kind!==command.line.kind||
          (old.kind==='saving'&&(old.reserveId!==command.line.reserveId||old.accountId!==command.line.accountId))))fail('HISTORY','O tipo de movimento ou o destino da poupança tem histórico. Crie outra linha para alterar essa referência.');
        if(old?.kind==='expense'&&command.line.kind==='expense'){
          command.line.expenseModeRevision=!!old.variable!==!!command.line.variable?requestId:old.expenseModeRevision;
        }
      }
      if(i<0)lines.push(command.line);else lines[i]=command.line;
      if(command.execution){
        const l=command.line;
        if(old||command.target||!['expense','income'].includes(l.kind)||command.execution.source!==plannedSource(l))
          fail('COMMAND','A execução imediata deve pertencer a uma nova despesa ou recebimento e usar a origem indicada.');
        if(command.execution.amount===0)fail('AMOUNT','Indique um montante superior a zero.');
        financial({...command.execution,type:'execute',lineId:l.id,complete:!l.variable,description:l.variable?command.execution.description:undefined});
      }
      break;
    }
    case 'save':{
      const reserve=s.reserves.find(r=>r.id===command.reserveId);
      if(!reserve)fail('RESERVE','Escolha a poupança de destino.');
      const source=sourceInfo(command.source).account;
      if(!source||source.archived||source.restricted)fail('SOURCE','Escolha um banco ativo para o débito.');
      const bank=aid(reserve.accountId),destination=rid(reserve.id);
      if(sourceInfo(bank).account?.archived)fail('DESTINATION','O banco da poupança está arquivado.');
      amount(command.amount);validDate(command.date,m.period);
      if(command.amount===0)fail('AMOUNT','Indique um montante superior a zero.');
      const goal=savingGoals(m,reserve.id).find(l=>l.id===command.lineId);
      const remaining=goal?pending(m,goal):0;
      if(command.lineId&&(!goal||remaining===null||remaining===0))fail('GOAL','Escolha um objetivo do mês com montante por poupar.');
      const portion=Math.min(command.amount,remaining??0);
      applyInitials(command.initials,[command.source,bank,destination]);
      knownBalance(command.source,'SOURCE');requireFunds(command.source,command.amount,'poupar');
      knownBalance(destination,'DESTINATION');
      const transferId=command.source===bank?undefined:`${requestId}:transfer`;
      if(transferId)financial({type:'transfer',source:command.source,destination:bank,amount:command.amount,date:command.date},undefined,transferId);
      event({lineId:goal?.id,amount:portion,date:command.date,note:portion?'Reforço para o objetivo do mês':'Reforço extra',type:'saving',
        deltas:{[bank]:-command.amount,[destination]:command.amount},saving:{reserveId:reserve.id,extra:command.amount-portion,transferId}});
      break;
    }
    case 'associateSaving':{
      const goal=m.lines.find(l=>l.id===command.lineId&&l.kind==='saving'&&l.reserveId);
      const parent=activeEvents(m).find(e=>e.id===command.eventId);
      if(!goal||!parent)fail('GOAL','Escolha um reforço e um objetivo desta poupança.');
      if(activeEvents(m).some(e=>e.savingParentId===parent.id&&e.lineId===goal.id))
        fail('GOAL','Este reforço já tem uma associação a este objetivo. Pode anulá-la no histórico.');
      const remaining=pending(m,goal);
      amount(command.amount);
      if(!command.amount||remaining===null||command.amount>remaining||command.amount>freeSaving(m,parent,goal.reserveId!))
        fail('AMOUNT','Indique um valor até ao montante ainda disponível no reforço e em falta no objetivo.');
      event({lineId:goal.id,amount:command.amount,date:parent.date,note:'Reforço existente associado ao objetivo',type:'savingAssociation',deltas:{},savingParentId:parent.id});
      break;
    }
    case 'removeLine':{
      const lines=command.target==='base'?s.base:m.lines,i=lines.findIndex(l=>l.id===command.id);if(i<0)fail('LINE','Movimento não encontrado.');
      if(command.target!=='base'){
        if(activeEvents(m).some(e=>e.lineId===command.id))fail('HISTORY','Anule os registos desta linha antes de a remover.');
        (m.removedLines??=[]).push(structuredClone(lines[i]));
        for(const o of m.occurrences)if(o.lineId===command.id){o.state='open';delete o.lineId;}
      }
      lines.splice(i,1);break;
    }
    case 'execute':case 'transfer':case 'reconcile':financial(command);break;
    case 'recordSuggestedTransfers':{
      const routes=transferRoutes(accountFunding(s,m).suggestions);
      if(command.period!==m.period||!routes.length||canonical(routes)!==canonical(command.routes))
        fail('BATCH_CHANGED','As transferências sugeridas mudaram. Reveja a lista ou registe individualmente o que já fez no banco.');
      for(const [index,route] of routes.entries()){
        financial({type:'transfer',date:command.date,...route},undefined,`${requestId}:transfer:${index}`);
      }
      break;
    }
    case 'void':{
      const entry=voidEvent(command.id);
      const reinforcement=entry.saving?entry:activeEvents(m).find(e=>e.saving?.transferId===entry.id);
      if(reinforcement&&reinforcement!==entry)voidEvent(reinforcement.id);
      if(entry.saving?.transferId)voidEvent(entry.saving.transferId);
      for(const e of activeEvents(m))if(e.savingParentId&&(e.savingParentId===entry.id||e.savingParentId===reinforcement?.id))voidEvent(e.id);
      break;
    }
    case 'correct':{
      const old=voidEvent(command.id),a=command.replacement;
      if(activeEvents(m).some(e=>e.saving?.transferId===old.id||e.savingParentId===old.id))
        fail('DEPENDENCY','Anule a operação ligada ou a associação antes de corrigir este registo.');
      const expected=a.type==='execute'?(a.includedInTotal?'detail':a.total?'total':'execution'):a.type==='reconcile'?'adjustment':'transfer';
      if(expected!==old.type||(a.type==='execute'&&a.lineId!==old.lineId))fail('CORRECTION','Uma correção preserva o tipo e a linha do registo.');
      financial(a,old);const replacement=m.events.find(e=>e.id===requestId);if(!replacement)fail('CORRECTION','A correção deve criar um registo; use Anular para retirar o ajuste.');replacement.corrects=old.id;old.replacedBy=replacement.id;break;
    }
    case 'occurrence':{
      const o=m.occurrences.find(o=>o.id===command.id);if(!o||o.state!=='open')fail('OCCURRENCE','Este lembrete já foi tratado.');
      if(command.mode==='dismiss'){o.state='dismissed';break;}
      if(command.mode==='link'){
        const l=linkableExpenses(m).find(l=>l.id===command.lineId);
        if(!l)fail('LINE','Escolha uma despesa do plano que ainda não esteja associada a um lembrete.');
        o.lineId=l.id;
      }
      else if(command.mode==='add'){
        const id=occurrenceLineId(o.id);
        if(m.lines.some(l=>l.id===id))fail('OCCURRENCE','Já existe uma linha criada para este lembrete.');
        // A removed generated line is restored with its identity, never duplicated.
        const removed=m.removedLines?.find(l=>l.id===id);
        m.lines.push(removed?structuredClone(removed):{id,name:o.name,kind:'expense',plan:o.amount,accountId:o.accountId,categoryId:'',reserveId:o.reserveId});
        m.removedLines=m.removedLines?.filter(l=>l.id!==id);o.lineId=id;
      }else fail('COMMAND','Ação de lembrete inválida.');o.state='linked';break;
    }
    case 'recurring':{
      const r=command.definition;validId(r.id);validName(r.name);validDate(r.date);if(r.amount!==null)amount(r.amount);if(!['monthly','annual'].includes(r.frequency)||typeof r.active!=='boolean')fail('RECURRING','Definição recorrente inválida.');
      if(r.reminderText!==undefined||r.reminderDays!==undefined){
        if(typeof r.reminderText!=='string'||!r.reminderText.trim()||r.reminderText.trim().length>200||!Number.isInteger(r.reminderDays)||r.reminderDays!<0||r.reminderDays!>365)
          fail('REMINDER','Escreva um lembrete até 200 caracteres e indique entre 0 e 365 dias de antecedência.');
        r.reminderText=r.reminderText.trim();
      }
      if(!r.accountId&&r.reserveId)r.accountId=s.reserves.find(reserve=>reserve.id===r.reserveId)?.accountId??'';
      const old=s.recurring.find(x=>x.id===r.id);
      validateLine({id:r.id,name:r.name,kind:'expense',plan:r.amount,accountId:r.accountId,categoryId:'',reserveId:r.reserveId},old?{...old,kind:'expense',plan:old.amount,categoryId:''}:undefined);
      const i=s.recurring.findIndex(x=>x.id===r.id);if(i<0)s.recurring.push(r);else s.recurring[i]=r;break;
    }
    case 'reserve':{
      const r=command.reserve;validId(r.id);validName(r.name);
      const a=s.accounts.find(a=>a.id===r.accountId&&!a.archived&&!a.restricted);
      if(!a)fail('ACCOUNT','Escolha uma conta principal válida para a reserva.');
      const old=s.reserves.find(x=>x.id===r.id);
      if(old&&old.accountId!==r.accountId)fail('HISTORY','A conta de uma reserva existente não pode ser alterada.');
      if(old)s.reserves[s.reserves.indexOf(old)]=r;else s.reserves.push(r);
      break;
    }
    case 'account':{
      const a=command.account;validId(a.id);validName(a.name);if(typeof a.restricted!=='boolean')fail('ACCOUNT','Tipo de conta inválido.');
      const i=s.accounts.findIndex(x=>x.id===a.id);
      if(s.accounts.some(x=>x.id!==a.id&&x.name===a.name))fail('NAME','Já existe uma conta com esse nome.');
      if(i>=0&&s.accounts[i].restricted!==a.restricted)fail('HISTORY','O tipo de uma conta existente não pode reclassificar os meses. Crie outra conta.');
      if(i<0)s.accounts.push(a);else s.accounts[i]=a;break;
    }
    case 'deleteAccount':{
      validId(command.id);
      if(!s.accounts.some(a=>a.id===command.id))fail('ACCOUNT','A conta já não existe.');
      if(!canDeleteAccount(s,command.id))fail('HISTORY','Esta conta tem saldos, movimentos ou referências no plano, nas poupanças ou nos lembretes. Pode desativá-la.');
      s.accounts=s.accounts.filter(a=>a.id!==command.id);
      for(const month of Object.values(s.months))delete month.initials[aid(command.id)];
      break;
    }
    case 'category':{
      const c=command.category;validId(c.id);validName(c.name);if(s.categories.some(x=>x.id!==c.id&&x.name===c.name))fail('NAME','Já existe uma categoria com esse nome.');const i=s.categories.findIndex(x=>x.id===c.id);if(i<0)s.categories.push(c);else s.categories[i]=c;break;
    }
    default:fail('COMMAND','Comando desconhecido.');
  }
  validateResult(s,s.months[s.selected]);
  s.requests[key]=fingerprint;return s;
}
