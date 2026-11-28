import { aid, rid, type State, type Month, type Line, type Event } from './model';
import { amount, sum, fail, validDate, validPeriod, validId, validName } from './validation';
import { accountFunding, transferRoutes } from './funding';
import { money } from './money';
import { activeEvents, realized, completed, pending, effects, balance, plannedSource, planTotal, canDeleteAccount, occurrenceLineId, linkableExpenses, savingGoals, freeSaving, defaultReserveInitial, sourceTotals, summary, totalUnallocated, accumulatedTotal, unassignedExpenseTotal } from './projections';
import { newMonth } from './months';
import { type FinancialAction, type SavingEntry, type Action, canonical } from './actions';
export { DomainError } from './validation';
export * from './projections';
export * from './months';
export { canonical, type Action, type FinancialAction } from './actions';

function requireMovementAmount(amount:number,complete?:boolean){
  if(amount===0&&!complete)fail('AMOUNT','Indique um montante superior a zero ou conclua explicitamente por zero.');
}
function validateResult(s:State,m:Month){
  for(const source of Object.keys(m.initials)){const b=balance(m,source);if(b!=null&&b<0)fail('DEPENDENCY','Esta operação deixaria a origem negativa. Anule primeiro a utilização ou transferência relacionada.');}
  for(const e of activeEvents(m))for(const [id,n] of Object.entries(e.allocations??{})){
    const parent=activeEvents(m).find(p=>p.id===id&&p.type==='total'&&p.amount>0&&p.lineId===e.lineId);
    if(!parent||n<=0||totalUnallocated(m,parent)<0)fail('DEPENDENCY','Este ajuste tem detalhes ou reduções dependentes. Anule primeiro esses registos.');
  }
  for(const l of m.lines){if(realized(m,l.id)<0)fail('DEPENDENCY','A anulação deixaria o gasto negativo. Corrija primeiro os ajustes dependentes.');pending(m,l);}
  summary(s,m);
  unassignedExpenseTotal(m);
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
  if(!m && command.type!=='month')fail('MONTH','Mês selecionado inexistente.');
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
  const initializeReserve=(id:string)=>{
    const source=rid(id);
    if(m.initials[source]==null)m.initials[source]=defaultReserveInitial(s,m,id);
  };
  const event=(e:Omit<Event,'id'>,id=requestId)=>{
    if(m.events.some(existing=>existing.id===id))fail('IDEMPOTENCY','Já existe um registo com esta chave. Inicie um novo registo.');
    const sourceNames=Object.fromEntries(Object.keys(e.deltas).map(k=>{const info=sourceInfo(k);return [k,info.account?.name??`Poupança · ${info.reserve!.name}`];}));
    m.events.push({...e,id,sourceNames,line:structuredClone(e.line??(e.lineId?m.lines.find(l=>l.id===e.lineId):undefined))});
  };
  const validateLine=(l:Line,old?:Line)=>{
    validId(l.id);validName(l.name);if(l.plan!==null)amount(l.plan);
    if(!['expense','income','saving','investment'].includes(l.kind))fail('KIND','Tipo de movimento inválido.');
    const a=s.accounts.find(a=>a.id===l.accountId),c=s.categories.find(c=>c.id===l.categoryId);
    if(l.accountId&&(!a||(a.archived&&old?.accountId!==a.id)))fail('ACCOUNT','Escolha uma conta válida e não arquivada.');
    if(l.categoryId&&(!c||(c.archived&&old?.categoryId!==c.id)))fail('CATEGORY','Escolha uma categoria válida e não arquivada.');
    if(l.variable&&l.kind!=='expense')fail('VARIABLE','Só uma despesa permite compras e total acumulado.');
    if(l.reserveId){
      const r=s.reserves.find(r=>r.id===l.reserveId);
      if(!r||a?.restricted||(l.kind==='expense'?r.accountId!==l.accountId:l.kind!=='saving'))fail('RESERVE','Escolha uma poupança compatível com o movimento.');
    }
    if(l.kind==='saving'&&(!l.reserveId||!a))fail('RESERVE','Escolha a poupança de destino e o banco de onde sai o reforço.');
  };
  let reversalIndex=0;
  const reverseEvent=(entry:Event)=>{
    event({type:'reversal', reverses:entry.id, groupId:requestId, lineId:entry.lineId,
      line:entry.line, amount:-entry.amount, date:entry.date, note:'Compensação',
      deltas:Object.fromEntries(Object.entries(entry.deltas).map(([source,delta])=>[source,-delta]))},
    `${requestId}:reversal:${reversalIndex++}`);
  };
  const activeEvent=(id:string)=>{
    const entry=activeEvents(m).find(e=>e.id===id);
    if(!entry)fail('EVENT','Este registo já não está ativo.');
    return entry;
  };
  const financial=(a:Exclude<FinancialAction,SavingEntry>,correction?:Event,id=requestId)=>{
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
      if((from.reserve&&a.destination!==aid(from.reserve.accountId))||(to.reserve&&a.source!==aid(to.reserve.accountId)))fail('DESTINATION','Só pode transferir entre uma poupança e a sua conta principal. Registe a devolução antes de transferir para outra conta.');
      applyInitials(a.initials,[a.source,a.destination]);
      if(from.reserve)initializeReserve(from.reserve.id);
      if(to.reserve)initializeReserve(to.reserve.id);
      requireFunds(a.source,a.amount);
      knownBalance(a.destination,'DESTINATION');
      event({amount:0,date:a.date,note:'Transferência própria (sem receita nem despesa)',type:'transfer',deltas:{[a.source]:-a.amount,[a.destination]:a.amount}},id);return;
    }
    const l=correction?.line??m.lines.find(l=>l.id===a.lineId);if(!l)fail('LINE','Movimento não encontrado.');
    if(!correction&&completed(m,l.id))fail('COMPLETE','Este movimento está concluído. Anule o registo para corrigir.');
    if(typeof a.complete!=='boolean'||(a.total!==undefined&&typeof a.total!=='boolean'))fail('COMMAND','Confirmação inválida.');
    if(a.remaining&&(!a.complete||a.total||a.includedInTotal||a.amount!==pending(m,l)))
      fail('CONFLICT','O valor por realizar mudou. Reveja o movimento antes de confirmar.');
    const reserve=sourceInfo(a.source).reserve;
    if(l.kind==='income'&&reserve)fail('SOURCE','Recebimentos entram numa conta principal, não diretamente numa poupança.');
    if(l.kind==='investment'&&reserve)fail('SOURCE','O investimento sai de uma conta principal.');
    if(l.kind==='saving'){
      if(a.source!==aid(l.accountId))fail('SOURCE','O reforço deve sair da conta principal indicada.');
      const r=s.reserves.find(r=>r.id===l.reserveId);
      if(!r)fail('RESERVE','Escolha uma poupança de destino válida.');
    }
    if(a.reserveAfter!==undefined&&(l.kind!=='expense'||!reserve||m.initials[a.source]!=null||Object.hasOwn(a.initials??{},a.source)||a.includedInTotal))
      fail('RESERVE_BALANCE','Só pode indicar o total após o pagamento quando a poupança ainda está por confirmar.');
    const secondSource=a.shortfall?.secondSource;
    if(a.shortfall){
      if(l.kind!=='expense'||!reserve||a.total||a.includedInTotal||a.reserveAfter!==undefined||m.initials[a.source]==null)
        fail('SHORTFALL','A repartição exige uma despesa com saldo conhecido na primeira poupança.');
      if(secondSource!==null){
        if(!secondSource||secondSource===a.source)fail('SHORTFALL','Escolha uma segunda origem diferente da primeira.');
        const {account,reserve:secondReserve}=sourceInfo(secondSource);
        const bank=account??s.accounts.find(bank=>bank.id===secondReserve?.accountId);
        if(!bank||bank.restricted||(bank.archived&&!Object.hasOwn(correction?.deltas??{},secondSource)))
          fail('SHORTFALL','Escolha uma segunda origem disponível e sem restrições.');
      }
    }
    applyInitials(a.initials,[a.source,...(l.kind==='saving'?[rid(l.reserveId!)]:[]),...(secondSource?[secondSource]:[])]);
    if(l.kind==='saving')initializeReserve(l.reserveId!);
    let n=a.amount;
    let allocations:Record<string,number>={};
    let totalObservation:Event['totalObservation'];
    if(a.includedInTotal!==undefined){
      knownBalance(a.source);
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
    if(n===0&&a.total&&!a.complete)return;
    requireMovementAmount(n,a.complete);
    if(reserve){
      if(a.reserveAfter!==undefined){
        amount(a.reserveAfter);
        applyInitials({[a.source]:sum([a.reserveAfter,n,-effects(m,a.source)])},[a.source]);
      }else if(m.initials[a.source]==null){
        initializeReserve(reserve.id);
        if(l.kind==='expense'&&(balance(m,a.source)??0)<n)
          fail('RESERVE_BALANCE','O saldo estimado não cobre o débito. Indique o total da poupança para confirmar este registo.');
      }
    }
    const available=knownBalance(a.source);
    const deltas:Record<string,number>={[a.source]:l.kind==='income'?n:-n};
    let reserveShortfall:Event['reserveShortfall'];
    if(a.shortfall){
      if(available!==a.shortfall.available||available<0||available>=n)
        fail('CONFLICT','O saldo da primeira poupança mudou. Reveja a repartição da despesa.');
      const remaining=n-available;
      deltas[a.source]=-available;
      if(secondSource){
        const secondBalance=knownBalance(secondSource,'SHORTFALL');
        if(secondBalance<remaining)
          fail('SHORTFALL',`${sourceLabel(secondSource)} tem ${money(secondBalance)} disponíveis. A segunda origem precisa de cobrir ${money(remaining)}.`);
        deltas[secondSource]=-remaining;
      }
      reserveShortfall={source:a.source,unassigned:secondSource?0:remaining};
    }else if(l.kind!=='income'&&n>0)requireFunds(a.source,n,l.kind==='expense'?'pagar':'registar');
    if(l.kind==='saving')deltas[rid(l.reserveId!)]=n;
    event({lineId:l.id,line:l,amount:n,date:a.date,description:l.kind==='expense'&&!a.total?a.description?.trim()||undefined:undefined,note:a.total?'Ajuste conciliado do total acumulado':l.kind==='saving'?'Reforço de poupança':l.kind==='investment'?'Aplicação em investimento':l.kind==='income'?'Recebimento':'Pagamento / compra',type:a.total?'total':'execution',deltas,complete:a.complete,allocations,totalObservation,...(reserveShortfall?{reserveShortfall}:{})},id);
  };
  const saving=(entry:SavingEntry)=>{
    const reserve=s.reserves.find(r=>r.id===entry.reserveId);
    if(!reserve)fail('RESERVE','Escolha a poupança de destino.');
    amount(entry.amount);validDate(entry.date,m.period);
    if(entry.complete!==undefined&&typeof entry.complete!=='boolean')fail('COMMAND','Confirmação inválida.');
    const goal=savingGoals(m,reserve.id).find(l=>l.id===entry.lineId);
    const remaining=goal?pending(m,goal):0;
    if((entry.lineId||entry.complete)&&(!goal||remaining===null||remaining===0))fail('GOAL','Escolha um objetivo do mês com montante por poupar.');
    requireMovementAmount(entry.amount,entry.complete);
    if(entry.amount===0){
      applyInitials(entry.initials,[]);
      event({lineId:goal!.id,amount:0,date:entry.date,note:'Objetivo do mês concluído sem novo reforço',type:'saving',deltas:{},complete:true,saving:{reserveId:reserve.id,extra:0}});
      return;
    }
    const source=sourceInfo(entry.source).account;
    if(!source||source.archived||source.restricted)fail('SOURCE','Escolha um banco ativo para o débito.');
    const bank=aid(reserve.accountId),destination=rid(reserve.id);
    if(sourceInfo(bank).account?.archived)fail('DESTINATION','O banco da poupança está arquivado.');
    const portion=entry.complete?entry.amount:Math.min(entry.amount,remaining??0);
    applyInitials(entry.initials,[entry.source,bank,destination]);
    initializeReserve(reserve.id);
    knownBalance(entry.source,'SOURCE');requireFunds(entry.source,entry.amount,'poupar');
    knownBalance(destination,'DESTINATION');
    const transferId=entry.source===bank?undefined:`${requestId}:transfer`;
    if(transferId)financial({type:'transfer',source:entry.source,destination:bank,amount:entry.amount,date:entry.date},undefined,transferId);
    event({lineId:goal?.id,amount:portion,date:entry.date,note:portion?'Reforço para o objetivo do mês':'Reforço extra',type:'saving',complete:entry.complete,
      deltas:{[bank]:-entry.amount,[destination]:entry.amount},saving:{reserveId:reserve.id,extra:entry.amount-portion,transferId}});
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
      if(command.line.dueDate!==undefined){
        if(command.target==='base')fail('DATE','A data prevista pertence a um mês específico.');
        validDate(command.line.dueDate,m.period);
      }
      if(command.target!=='base'){
        if(m.removedLines?.some(l=>l.id===command.line.id))fail('ID','Este identificador pertence a uma linha removida. Crie uma nova linha.');
        if(old&&m.events.some(e=>e.lineId===old.id)&&(old.kind!==command.line.kind||
          (old.kind==='saving'&&old.reserveId!==command.line.reserveId)))fail('HISTORY','O tipo de movimento ou o destino da poupança tem histórico. Crie outra linha para alterar essa referência.');
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
    case 'save':saving(command);break;
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
      const entry=activeEvent(command.id);
      const reinforcement=entry.saving?entry:activeEvents(m).find(e=>e.saving?.transferId===entry.id);
      reverseEvent(entry);
      if(reinforcement&&reinforcement!==entry)reverseEvent(reinforcement);
      if(entry.saving?.transferId)reverseEvent(activeEvent(entry.saving.transferId));
      for(const e of activeEvents(m))if(e.savingParentId&&(e.savingParentId===entry.id||e.savingParentId===reinforcement?.id))reverseEvent(e);
      break;
    }
    case 'correct':{
      const old=activeEvent(command.id),a=command.replacement;
      if(activeEvents(m).some(e=>e.saving?.transferId===old.id||e.savingParentId===old.id))
        fail('DEPENDENCY','Anule a operação ligada ou a associação antes de corrigir este registo.');
      const expected=a.type==='execute'?(a.includedInTotal?'detail':a.total?'total':'execution'):a.type==='reconcile'?'adjustment':a.type==='save'?'saving':'transfer';
      if(expected!==old.type||(a.type==='execute'&&a.lineId!==old.lineId))fail('CORRECTION','Uma correção preserva o tipo e a linha do registo.');
      reverseEvent(old);
      if(a.type==='save'){
        if(a.reserveId!==(old.saving?.reserveId??old.line?.reserveId)||a.lineId!==old.lineId)
          fail('CORRECTION','A correção preserva a poupança e o objetivo do reforço.');
        if(old.saving?.transferId)reverseEvent(activeEvent(old.saving.transferId));
        saving(a);
        const transfer=m.events.find(e=>e.id===`${requestId}:transfer`);
        if(transfer)transfer.groupId=requestId;
      }else financial(a,old);
      const replacement=m.events.find(e=>e.id===requestId);if(!replacement)fail('CORRECTION','A correção deve criar um registo; use Anular para retirar o ajuste.');replacement.corrects=old.id;replacement.groupId=requestId;break;
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
      if(!a)fail('ACCOUNT','Escolha uma conta principal válida para a poupança.');
      const old=s.reserves.find(x=>x.id===r.id);
      if(old&&old.accountId!==r.accountId)fail('HISTORY','A conta de uma poupança existente não pode ser alterada.');
      if(old)s.reserves[s.reserves.indexOf(old)]=r;else s.reserves.push(r);
      break;
    }
    case 'account':{
      const a=command.account;validId(a.id);validName(a.name);if(typeof a.restricted!=='boolean')fail('ACCOUNT','Tipo de conta inválido.');
      const i=s.accounts.findIndex(x=>x.id===a.id);
      if(s.accounts.some(x=>x.id!==a.id&&x.name===a.name))fail('NAME','Já existe uma conta com esse nome.');
      if(i>=0&&s.accounts[i].restricted!==a.restricted)fail('HISTORY','O tipo de uma conta existente não pode reclassificar os meses. Crie outra conta.');
      // Old account confirmations can still be replayed. The migration owns their former defaults.
      const {baseInitial: _legacy,...account}=a as typeof a & {baseInitial?:number|null};
      if(i<0)s.accounts.push(account);else s.accounts[i]=account;
      break;
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
