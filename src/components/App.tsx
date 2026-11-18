'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { usePersistentStore } from '@/data/usePersistentStore';
import { newRequestId } from '@/data/requestId';
import type { Month, State } from '@/domain/model';
import { DomainError, accumulatedTotal, activeEvents, balance, canDeleteAccount, completed, defaultReserveInitial, effects, freeSaving, precedingMonth, previousSavingBalance, reserveUse, savingGoals, savingProgress, totalUnallocated, initialPlan, linkableExpenses, obligations, pending, plannedSource, planTotal, realized, type Action } from '@/domain/engine';
import { aid, rid, type Account, type Line, type Kind, type Recurring, type Reserve } from '@/domain/model';
import { calendarDate, dateLabel, inputMoney, money, monthLabel, parseMoney } from '@/domain/money';
import { Choice, Dialog, Select } from './Dialog';
import { Icon } from './Icon';
import { InitialBalances } from './InitialBalances';
import { BudgetRemainders } from './BudgetRemainders';
import { AccountFunding } from './AccountFunding';
import { RecurringPayments } from './RecurringPayments';
import { LocalFiles } from './LocalFiles';
import { MoneyInput } from './MoneyInput';
import { MovementList } from './MovementList';
import { ActiveMovementFilters, defaultMovementView, MovementFilters } from './MovementFilters';
import { MonthFunding } from './MonthFunding';
import { SearchField } from './SearchField';
import { compareNames, matchesText } from '@/domain/text';
import { validPeriod, validDate, validName, daysInMonth, subtotal, sum } from '@/domain/validation';
import { accountFunding, knownBankAvailability, reserveFunding } from '@/domain/funding';
import { advanceReminders } from '@/domain/reminders';

type Screen='month'|'plan'|'accounts'|'savings'|'recurring'|'base'|'settings';
type Modal={kind:string;id?:string;target?:'base';source?:string;reserveId?:string;otherBank?:boolean;optionalGoal?:boolean;fromExpenseRemainder?:boolean;requestId:string;revision?:number;returnTo?:string;eventId?:string};
const navigation:{id:Screen;label:string;icon:string}[]=[{id:'month',label:'Mês',icon:'month'},{id:'plan',label:'Plano e movimentos',icon:'base'},{id:'accounts',label:'Contas',icon:'accounts'},{id:'savings',label:'Poupanças',icon:'savings'},{id:'recurring',label:'Pagamentos recorrentes',icon:'recurring'},{id:'base',label:'Modelo Base',icon:'base'},{id:'settings',label:'Definições',icon:'settings'}];
const kindLabel:Record<Kind,string>={expense:'Despesas',income:'Receitas mensais',saving:'Reforços de poupança',investment:'Investimentos'};
const monthKindLabel:Record<Kind,string>={expense:'Despesas',income:'Receitas',saving:'Poupanças',investment:'Investimentos'};
const monthKindTotal:Record<Kind,string>={expense:'Total de despesas',income:'Total de receitas previstas',saving:'Total de poupanças',investment:'Total de investimentos'};
const baseKinds:Kind[]=['income','expense','saving'];
const createLabel:Record<Kind,string>={expense:'Adicionar despesa ao plano',income:'Adicionar receita ao plano',saving:'Adicionar poupança ao mês',investment:'Adicionar investimento'};
const accountColors={
  '#7a9c8c':'#246a54',
  '#9eabc3':'#365b96',
  '#6eaaa6':'#167b80',
  '#b3a1bb':'#754b8e',
  '#c79586':'#a7493b',
  '#c5ad74':'#826010',
};
const accountColor=(color:string)=>accountColors[color.toLowerCase() as keyof typeof accountColors]??color;
const noAccounts='Sem contas disponíveis';
const isLongAmount=(amount:number|null)=>amount!==null&&money(amount).length>13;
const totalEffect=(adjustment:number)=>adjustment===0?'Sem alteração ao saldo':adjustment>0
  ?`Débito adicional de ${money(adjustment)}`:`Crédito de ${money(-adjustment)}`;
type PaymentReceipt={period:string;lineId:string;eventId:string};
type RemainderSaving={reserve:Reserve;amount:number;source:string;date:string;lineId:string};
function PaymentFeedback({lineId,text,expiresAt,onView}:{lineId:string;text:string;expiresAt:number;onView:()=>void}){
  const ref=useRef<HTMLDivElement>(null);
  const [expired,setExpired]=useState(false),[focused,setFocused]=useState(false),[hidden,setHidden]=useState(()=>Date.now()>=expiresAt);
  useEffect(()=>{const timer=setTimeout(()=>setExpired(true),Math.max(0,expiresAt-Date.now()));return ()=>clearTimeout(timer);},[expiresAt]);
  useEffect(()=>{
    if(!expired||focused||ref.current?.contains(document.activeElement))return;
    const timer=setTimeout(()=>setHidden(true),matchMedia('(prefers-reduced-motion: reduce)').matches?0:240);
    return ()=>clearTimeout(timer);
  },[expired,focused]);
  return <div ref={ref} className={`payment-feedback${expired&&!focused?' leaving':''}`} hidden={hidden} id={`receipt-${lineId}`}
    onFocus={()=>setFocused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}}>
    <p>{text}</p><button className="text-button" onClick={onView}>Ver registo</button>
  </div>;
}
type Store=ReturnType<typeof usePersistentStore>&{state:State};
export function App({recoveryScope,showLocalData}:{recoveryScope?:string;showLocalData:boolean}){
  const store=usePersistentStore(recoveryScope);
  if(!store.state)return <div className="app-shell storage-opening" data-ready="false"><h1>O meu mês</h1><p role="status">{store.error?'Não foi possível abrir O meu mês.':'A abrir O meu mês…'}</p>{store.error&&<><p role="alert" className="form-error">{store.error}</p><button className="button" onClick={()=>void store.refresh()}>Tentar novamente</button></>}</div>;
  return <Workspace store={{...store,state:store.state}} recovery={!!recoveryScope} showLocalData={showLocalData}/>;
}
function Workspace({store,recovery,showLocalData}:{store:Store;recovery:boolean;showLocalData:boolean}){
  const {state:s,dispatch,busy,uncertain}=store;
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  const [screen,setScreen]=useState<Screen>('month'),[tab,setTab]=useState<Kind>('expense');
  const [expandedMetric,setExpandedMetric]=useState<'balance'|'expenses'|'savings'|null>(null);
  const expandedMetricSlot=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!expandedMetric)return;
    const closeOutside=(e:PointerEvent)=>{
      if(!expandedMetricSlot.current?.contains(e.target as Node))setExpandedMetric(null);
    };
    document.addEventListener('pointerdown',closeOutside);
    return ()=>document.removeEventListener('pointerdown',closeOutside);
  },[expandedMetric]);
  const [planView,setPlanView]=useState(defaultMovementView);
  const pendingOnly=planView.status==='pending';
  const [modal,setModal]=useState<Modal|null>(null),[values,setValues]=useState<Record<string,string>>({}),[error,setError]=useState(''),[initialErrorSource,setInitialErrorSource]=useState(''),[globalError,setGlobalError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState('');
  const [errorCode,setErrorCode]=useState('');
  const [errorAttempt,setErrorAttempt]=useState(0);
  const [catalogSearch,setCatalogSearch]=useState({account:'',category:''});
  const [receipt,setReceipt]=useState<(PaymentReceipt&{expiresAt:number})|null>(null);
  const pendingReceipt=useRef<PaymentReceipt|null>(null);
  const pendingRemainderSaving=useRef<RemainderSaving|null>(null);
  const showReceipt=(confirmation:PaymentReceipt)=>setReceipt({...confirmation,expiresAt:Date.now()+10000});
  const shownReceipt=useRef<typeof receipt>(null);
  const [conflict,setConflict]=useState(false);
  const [menu,setMenu]=useState(false);
  const menuButton=useRef<HTMLButtonElement>(null);
  const menuPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(menu)menuPanel.current?.querySelector('button')?.focus();},[menu]);
  function closeMenu(){setMenu(false);menuButton.current?.focus();}
  async function reloadAfterConflict(){
    if(!await store.refresh?.())return;
    setConflict(false);setModal(null);setError('');setErrorCode('');setGlobalError('');
    notify('Dados recarregados. Abra a edição para voltar a preencher.');
  }
  function reportConflict(e:unknown){
    if(!(e instanceof DomainError)||e.code!=='CONFLICT')return false;
    setConflict(true);setGlobalError('Os dados mudaram desde que abriu esta edição. Recarregue para voltar a editar.');
    return true;
  }
  useEffect(()=>{
    if(!error||busy)return;
    const message=document.getElementById('form-error');
    const field=message?.closest('dialog')?.querySelector<HTMLElement>('[aria-invalid="true"][aria-describedby~="form-error"]');
    field?.focus({preventScroll:true});
    (field??message)?.scrollIntoView({block:'center'});
  },[error,errorAttempt,busy]);
  useEffect(()=>{if(globalError)document.getElementById('workspace-error')?.scrollIntoView({block:'center'});},[globalError]);
  const m=s.months[s.selected];
  const hasInvestment=m.lines.some(l=>l.kind==='investment');
  const forecastLabel=hasInvestment?'Após despesas, reforços e investimentos previstos':'Após despesas e reforços previstos';
  const monthAccounts=s.accounts.filter(a=>!a.restricted&&!a.archived).map(account=>{
    const source=aid(account.id),current=balance(m,source),remaining=obligations(m,source);
    return {account,current,forecast:current===null||remaining===null?null:current-remaining};
  });
  const balancesKnown=monthAccounts.flatMap(({current})=>current===null?[]:[current]);
  const currentTotal=balancesKnown.length?sum(balancesKnown):null;
  const expenseGroups=new Map<string,{line:Line;amount:number|null}[]>();
  for(const line of m.lines.filter(l=>l.kind==='expense')){
    const amount=pending(m,line);
    if(amount===0)continue;
    const source=plannedSource(line);
    const known=line.reserveId?s.reserves.some(r=>rid(r.id)===source):s.accounts.some(a=>aid(a.id)===source);
    const key=known?source:'';
    const group=expenseGroups.get(key)??[];
    group.push({line,amount});expenseGroups.set(key,group);
  }
  const expenses=subtotal([...expenseGroups.values()].flatMap(rows=>rows.map(({amount})=>amount)));
  const forecast=knownBankAvailability(s,m,false);
  const savingCommitments=screen==='month'?m.lines.filter(l=>l.kind==='saving'||l.kind==='investment')
    .map(line=>({line,amount:pending(m,line)})).filter(({amount})=>amount!==0):[];
  const savings=subtotal(savingCommitments.map(({amount})=>amount));
  const reserveWarnings=screen==='savings'?reserveFunding(s,m):[];
  const funding=screen==='month'||screen==='accounts'?accountFunding(s,m):null;
  const reserveWarningText=({current,required,missing}:typeof reserveWarnings[number])=>missing!==null
    ?`Faltam ${money(missing)} para cobrir as despesas previstas.`
    :`Por apurar. ${current===null?'Saldo inicial por indicar. ':''}${required===null?'Valor por indicar no plano.':''}`;
  const upcomingReminders=screen==='month'?advanceReminders(s.recurring,m.period,calendarDate()):[];
  const monthKinds:Kind[]=['expense','income','saving'];
  if(hasInvestment||tab==='investment')monthKinds.push('investment');
  const modelKinds=s.base.some(l=>l.kind==='investment')?[...baseKinds,'investment' as const]:baseKinds;
  const [fundingOpen,setFundingOpen]=useState(false);
  const selectedLine=modal?.id&&['line','detail','payment'].includes(modal.kind)?(modal.target==='base'?s.base:m.lines).find(l=>l.id===modal.id):undefined;
  const nameOf=(id:string)=>s.accounts.find(a=>a.id===id)?.name??'Conta por indicar';
  const reserveLabel=(r:Reserve)=>{
    const duplicates=s.reserves.filter(x=>x.accountId===r.accountId&&x.name===r.name);
    if(duplicates.length<2)return r.name;
    // Catalog insertion order is preserved in SQLite. The selection itself always uses the ID.
    return `${r.name} · Poupança ${duplicates.findIndex(x=>x.id===r.id)+1} de ${duplicates.length}`;
  };
  const sources=[...s.accounts.filter(a=>!a.archived||(modal&&(aid(a.id)===values.source||aid(a.id)===values.destination||(modal.kind==='payment'&&(selectedLine?.accountId===a.id||m.events.some(e=>e.lineId===selectedLine?.id&&Object.hasOwn(e.deltas,aid(a.id)))))))).map(a=>({id:aid(a.id),name:a.name})),...s.reserves.map(r=>({id:rid(r.id),name:`Poupança · ${reserveLabel(r)} (${nameOf(r.accountId)})`}))];
  const accounts=s.accounts.filter(a=>!a.archived);
  const value=(key:string)=>values[key]??'';
  const reminder=modal?.kind==='link'?m.occurrences.find(o=>o.id===modal.id):undefined;
  const linkOptions=reminder?linkableExpenses(m):[];
  const linkTarget=linkOptions.find(l=>l.id===value('lineId'));
  const selectedReminder=m.occurrences.find(o=>o.lineId===selectedLine?.id&&o.lineId!==undefined);
  useLayoutEffect(()=>{
    if(!receipt||receipt===shownReceipt.current||modal||busy||receipt.period!==m.period)return;
    const detail=document.getElementById(`detail-${receipt.lineId}`);
    if(!detail)return;
    shownReceipt.current=receipt;
    const confirmation=document.getElementById(`receipt-${receipt.lineId}`);
    if(!detail.closest('.movement')?.querySelector('[data-pay]'))detail.focus({preventScroll:true});
    confirmation?.scrollIntoView({block:'nearest'});
  },[receipt,modal,busy,m.period]);
  const set=(key:string,v:string)=>{setValues(x=>({...x,[key]:v}));setError('');setErrorCode('');setInitialErrorSource('');};
  const sourceName=(id:string)=>sources.find(a=>a.id===id)?.name??(id.startsWith('a:')?nameOf(id.slice(2)):'Origem por indicar');
  const receiptText=(event:Month['events'][number])=>{
    const source=Object.keys(event.deltas)[0];
    const result=event.totalObservation?`Total gasto de ${money(event.totalObservation.observed)} · ${totalEffect(event.amount)}`
      :`${money(event.amount)} pagos${event.description?` · ${event.description}`:''}`;
    return `Gravação confirmada · ${result} · ${dateLabel(event.date)} · ${sourceName(source)}`;
  };
  const recentPayment=receipt?.period===m.period?activeEvents(m).find(event=>event.id===receipt.eventId):undefined;
  const reserveForm=s.reserves.find(r=>r.id===(modal?.reserveId??value('reserve')));
  const savingBank=reserveForm?aid(reserveForm.accountId):'';
  const savingSource=reserveForm?rid(reserveForm.id):'';
  const savingsInitial=modal?.source?.startsWith('r:')===true;
  const suggestedBalance=modal?.kind==='initial'&&savingsInitial?previousSavingBalance(s,m,modal.source!.slice(2)):null;
  const immediate=modal?.kind==='line'&&!modal.target&&!modal.id&&value('when')==='done'&&['expense','income'].includes(value('kind'));
  const effectiveSource=value('kind')==='expense'&&value('reserve')?rid(value('reserve')):value('account')?aid(value('account')):'';
  const goals=reserveForm?savingGoals(m,reserveForm.id):[];
  const enteredAmount=(()=>{try{return parseMoney(value('amount'));}catch{return null;}})();
  const finishMovement=value('complete')==='true';
  const expenseRemainder=modal?.kind==='payment'&&selectedLine?.kind==='expense'&&selectedLine.plan!==null&&
    !selectedLine.variable&&finishMovement&&enteredAmount!==null
    ?Math.max(0,(pending(m,selectedLine)??0)-enteredAmount):0;
  const remainderReserves=s.reserves.filter(reserve=>accounts.some(account=>account.id===reserve.accountId&&!account.restricted));
  const openGoals=goals.filter(l=>(pending(m,l)??0)>0);
  const goalForSaving=openGoals.find(l=>l.id===value('goalId'));
  const savingFromPlan=modal?.kind==='save'&&!!modal.id;
  const finishSaving=savingFromPlan&&finishMovement;
  const savingWithoutTransfer=finishSaving&&enteredAmount===0;
  const goalRemaining=goalForSaving?pending(m,goalForSaving):null;
  const freeReinforcements=reserveForm?activeEvents(m).filter(e=>freeSaving(m,e,reserveForm.id)>0):[];
  const associationOptions=goalForSaving?freeReinforcements.filter(e=>!activeEvents(m).some(x=>x.savingParentId===e.id&&x.lineId===goalForSaving.id)):[];
  const chooseId=(key:string,options:{id:string}[],code:string,message:string)=>{
    const id=value(key);
    if(!options.some(option=>option.id===id))throw new DomainError(code,message);
    return id;
  };
  const sourceId=(field='source')=>chooseId(field,sources,field==='source'?'SOURCE':'DESTINATION',field==='source'?'Escolha a origem do dinheiro na lista.':'Escolha o destino na lista.');
  const accountId=()=>chooseId('account',s.accounts,'ACCOUNT','Escolha uma conta da lista.');
  const categoryId=()=>chooseId('category',s.categories,'CATEGORY','Escolha uma categoria da lista.');
  const operationSources=modal?.kind==='payment'
    ?[value('source'),...(selectedLine?.kind==='saving'&&selectedLine.reserveId?[rid(selectedLine.reserveId)]:[])]
    :modal?.kind==='transfer'?[value('source'),value('destination')]
    :modal?.kind==='save'&&!savingWithoutTransfer?[value('source'),savingBank,savingSource]
    :immediate?[effectiveSource]:[];
  const expenseSource=immediate&&value('kind')==='expense'?effectiveSource:
    modal?.kind==='payment'&&selectedLine?.kind==='expense'&&!['total','detail'].includes(value('mode'))?value('source'):'';
  const reserveAfterSource=expenseSource.startsWith('r:')&&m.initials[expenseSource]==null?expenseSource:'';
  const missingBalances=[...new Set(operationSources)].filter(id=>!!id&&id!==reserveAfterSource&&m.initials[id]==null).map(id=>({
    id,name:sourceName(id),suggestion:id.startsWith('r:')?previousSavingBalance(s,m,id.slice(2)):null
  }));
  function collectInitials(){
    return Object.fromEntries(missingBalances.filter(source=>!source.id.startsWith('r:')||value(`initial:${source.id}`).trim()).map(source=>{
      try{return [source.id,parseMoney(value(`initial:${source.id}`))];}
      catch{setInitialErrorSource(source.id);throw new DomainError('INITIAL_VALUE',`Indique um saldo inicial válido para ${source.name}. Se começou vazio, indique 0,00 €.`);}
    }));
  }
  function collectReserveAfter(){
    const input=value(`reserveAfter:${reserveAfterSource}`);
    if(!reserveAfterSource||!input.trim())return undefined;
    try{return parseMoney(input);}
    catch(e){throw new DomainError('RESERVE_BALANCE',(e as Error).message);}
  }
  const dateDefault=()=>calendarDate().startsWith(s.selected)?calendarDate():`${s.selected}-01`;
  const notify=(text:string)=>{setNotice(text);setGlobalError('');};
  async function run(action:Action,text:string,requestId?:string,revision?:number){await dispatch(action,requestId,revision);notify(text);}
  function open(kind:string,options:Partial<Omit<Modal,'kind'|'requestId'|'revision'>>&{kind?:Kind}={}){
    if(busy||uncertain||conflict)return;
    const l=options.id?(options.target==='base'?s.base:m.lines).find(x=>x.id===options.id):undefined;
    let v:Record<string,string>={date:dateDefault(),amount:'',name:'',account:accounts[0]?.id??'',category:'',kind:options.kind??tab,source:sources[0]?.id??'',destination:sources[1]?.id??'',complete:'false',mode:'purchase',period:s.selected,reserve:''};
    if(kind==='month'){
      const [year,month]=s.selected.split('-').map(Number);
      if(month<12)v.period=s.selected.slice(0,5)+String(month+1).padStart(2,'0');
      else if(year<9999)v.period=String(year+1).padStart(4,'0')+'-01';
    }
    if(l)v={...v,name:l.name,amount:kind==='payment'&&l.variable?'':inputMoney(kind==='payment'?pending(m,l):l.plan),account:l.accountId,category:l.categoryId,kind:l.kind,source:l.kind==='expense'&&l.reserveId?rid(l.reserveId):l.accountId?aid(l.accountId):'',reserve:l.reserveId??'',variable:l.variable?'true':'false',dueDate:l.dueDate??''};
    if(options.source){
      const suggestion=kind==='initial'&&options.source.startsWith('r:')?previousSavingBalance(s,m,options.source.slice(2)):null;
      v={...v,source:options.source,amount:inputMoney(balance(m,options.source)??suggestion?.amount)};
      if(kind==='reconcile'&&options.source.startsWith('r:'))v.note='Conferência do total acumulado da poupança';
    }
    if(options.otherBank)v.source='';
    if(kind==='goal'||kind==='save'||kind==='associateSaving'){
      const reserve=s.reserves.find(r=>r.id===options.reserveId);
      if(reserve){
        const reserveGoals=savingGoals(m,reserve.id);
        const goal=kind==='goal'?(l??(reserveGoals.length===1?reserveGoals[0]:undefined)):
          (l&&(pending(m,l)??0)>0?l:reserveGoals.find(line=>(pending(m,line)??0)>0));
        v={...v,reserve:reserve.id,goalId:goal?.id??'',source:aid(goal?.accountId||reserve.accountId),account:goal?.accountId||reserve.accountId,category:goal?.categoryId??'',dueDate:goal?.dueDate??'',
          amount:inputMoney(kind==='goal'?goal?.plan:kind==='save'&&goal?pending(m,goal):null),
          savingMode:goal?'goal':'extra'};
      }
    }
    if(kind==='recurring')v.kind='expense';
    if(kind==='recurring'&&options.id){const r=s.recurring.find(r=>r.id===options.id)!;v={...v,...r,amount:inputMoney(r.amount),account:r.accountId,reserve:r.reserveId??'',active:r.active?'true':'false',reminderDays:String(r.reminderDays??30)};}
    if(kind==='recurring'&&!options.id)v={...v,date:calendarDate(),account:'',frequency:'monthly',active:'true',reminderDays:'30'};
    if(kind==='account'){
      const account=s.accounts.find(a=>a.id===options.id);
      const usedColors=new Set(s.accounts.map(a=>accountColor(a.color).toLowerCase()));
      const palette=Object.values(accountColors);
      const color=account?accountColor(account.color):palette.find(color=>!usedColors.has(color))??palette[s.accounts.length%palette.length];
      v={...v,name:account?.name??'',restricted:account?.restricted?'true':'false',color};
    }
    if(kind==='category'&&options.id)v.name=s.categories.find(c=>c.id===options.id)!.name;
    setValues(v);setError('');setErrorCode('');setInitialErrorSource('');setModal({...options,kind,requestId:newRequestId(),revision:store.revision});
  }
  function close(){if(busy)return;setModal(null);setError('');setErrorCode('');setInitialErrorSource('');}
  function showRemainderSaving(){
    const next=pendingRemainderSaving.current;
    pendingRemainderSaving.current=null;
    if(!next)return false;
    const source=accounts.some(account=>aid(account.id)===next.source&&!account.restricted)?next.source:'';
    setValues({reserve:next.reserve.id,amount:inputMoney(next.amount),source,date:next.date,savingMode:'extra'});
    setError('');setErrorCode('');setInitialErrorSource('');
    setModal({kind:'save',reserveId:next.reserve.id,fromExpenseRemainder:true,returnTo:`detail-${next.lineId}`,requestId:newRequestId(),revision:store.getRevision?.()});
    return true;
  }
  async function full(l:Line){
    const amount=pending(m,l);
    const source=l.kind==='expense'&&l.reserveId?rid(l.reserveId):aid(l.accountId);
    const requiredSources=[source,...(l.kind==='saving'&&l.reserveId?[rid(l.reserveId)]:[])];
    if(busy||uncertain||conflict)return;
    if(amount===null||amount===0||!l.accountId||requiredSources.some(id=>m.initials[id]==null)){
      open('payment',{id:l.id,returnTo:`pay-${l.id}`});
      setValues(v=>({...v,complete:'true'}));
      return;
    }
    const requestId=`${m.period}:${l.id}:full:${m.events.length}:${realized(m,l.id)}`;
    const confirmation=l.kind==='expense'?{period:m.period,lineId:l.id,eventId:requestId}:null;
    pendingReceipt.current=confirmation;
    try{
      await run({type:'execute',lineId:l.id,amount,date:dateDefault(),source,complete:true},
        confirmation?'':`${l.name}: ${money(amount)} ${l.kind==='income'?'recebidos':l.kind==='saving'?'reservados':'investidos'}. Gravação local confirmada.`,
        requestId,store.revision);
      if(confirmation)showReceipt(confirmation);
      pendingReceipt.current=null;
    }catch(e){
      if(e instanceof DomainError)pendingReceipt.current=null;
      if(!reportConflict(e)){open('payment',{id:l.id,returnTo:`pay-${l.id}`});formFailure(e);}
    }
  }
  async function submit(e:FormEvent){e.preventDefault();if(!modal||busy||uncertain||conflict)return;try{
    const amount=()=>{try{return parseMoney(value('amount'));}catch(e){throw new DomainError('AMOUNT',(e as Error).message);}};
    const dueDate=()=>{
      const date=value('dueDate');
      if(!date)return undefined;
      try{validDate(date,m.period);}catch(e){throw new DomainError('DUE_DATE',(e as Error).message);}
      return date;
    };
    const id=modal.id??modal.requestId;
    const form=new FormData(e.currentTarget as HTMLFormElement);
    let action:Action|undefined;
    let feedback='Gravação local confirmada. Os valores já refletem a ação.';
    switch(modal.kind){
      case 'month':{
        const period=value('period');
        validPeriod(period);
        action={type:'month',period};
        feedback='Mês criado com o Modelo Base e os saldos conhecidos do mês anterior.';
        if(s.months[period])feedback='Mês reaberto com os dados guardados.';
        break;
      }
      case 'initial':action={type:'initial',source:modal.source!,amount:savingsInitial&&!value('amount').trim()?defaultReserveInitial(s,m,modal.source!.slice(2)):amount()};break;
      case 'reconcile':action={type:'reconcile',source:modal.source!,amount:amount(),date:value('date'),note:value('note')};break;
      case 'payment':{
        const mode=value('mode'),description=value('description').trim();
        const cents=amount();
        validDate(value('date'),m.period);
        if(mode==='detail'&&!value('totalId'))throw new DomainError('DETAIL','Escolha o ajuste que já inclui esta compra.');
        action={type:'execute',lineId:modal.id!,amount:cents,date:value('date'),source:sourceId(),complete:mode!=='detail'&&finishMovement,total:mode==='total',description,initials:collectInitials(),includedInTotal:mode==='detail'?value('totalId'):undefined,reserveAfter:collectReserveAfter()};
        if(mode==='detail')feedback='Compra identificada no total existente. O gasto e o saldo mantêm-se.';
        else if(selectedLine?.kind==='expense'&&mode!=='total'&&description)feedback=`Compra «${description}» de ${money(cents)} registada em ${selectedLine.name}. Gravação local confirmada.`;
        break;
      }
      case 'line':{
        if(modal.target==='base'&&modal.id&&!selectedLine)throw new DomainError('HISTORY','Esta definição foi removida. Cancele para voltar ao Modelo Base.');
        const kind=value('kind') as Kind,variable=value('variable')==='true'&&kind==='expense';
        const reserve=value('reserve'),name=value('name').trim();
        validName(name);
        if(kind==='saving'&&!reserve)throw new DomainError('RESERVE','Escolha uma poupança para o reforço.');
        const account=accountId();
        const cents=value('amount')?amount():null;
        const category=kind==='income'&&!modal.target?(selectedLine?.categoryId??''):value('category')?categoryId():'';
        let execution:Extract<Action,{type:'line'}>['execution'];
        if(immediate){
          let actual:number;
          try{actual=parseMoney(variable?value('actual'):value('amount'));}
          catch(e){throw new DomainError(variable?'ACTUAL':'AMOUNT',(e as Error).message);}
          if(!actual)throw new DomainError(variable?'ACTUAL':'AMOUNT','Indique um montante superior a zero.');
          validDate(value('date'),m.period);
          execution={amount:actual,date:value('date'),source:effectiveSource,initials:collectInitials(),description:variable?value('description').trim():undefined,reserveAfter:collectReserveAfter()};
        }
        action={type:'line',target:modal.target,line:{id,name,kind,plan:cents,accountId:account,categoryId:category,reserveId:kind==='saving'||kind==='expense'?reserve||undefined:undefined,variable,dueDate:modal.target?undefined:dueDate()},execution};
        if(modal.target==='base')feedback='Modelo Base guardado para os meses ainda por criar.';
        else if(execution&&kind==='income')feedback=`${name} · ${money(execution.amount)} recebidos em ${dateLabel(execution.date)} · ${sourceName(execution.source)}. Gravação local confirmada.`;
        break;
      }
      case 'goal':{
        if(!reserveForm)throw new DomainError('RESERVE','Escolha a poupança.');
        if(modal.optionalGoal&&!value('amount').trim())break;
        const goal=goals.find(l=>l.id===value('goalId'));
        if(goals.length&&!goal)throw new DomainError('GOAL','Escolha o compromisso que pretende editar.');
        action={type:'line',line:{...(goal??{id,name:reserveForm.name,kind:'saving',reserveId:reserveForm.id}),plan:amount(),accountId:accountId(),categoryId:value('category')?categoryId():'',dueDate:dueDate()}};
        feedback=`Objetivo do mês de ${money(action.line.plan)} para ${reserveForm.name}. Gravação local confirmada.`;
        break;
      }
      case 'save':{
        if(!reserveForm)throw new DomainError('RESERVE','Escolha a poupança.');
        const forGoal=savingFromPlan||value('savingMode')==='goal';
        if(forGoal&&!goalForSaving)throw new DomainError('GOAL','Escolha um objetivo com montante por poupar.');
        const cents=amount();
        if(savingFromPlan&&!finishSaving&&goalRemaining!==null&&cents>goalRemaining){
          throw new DomainError('AMOUNT',`Faltam ${money(goalRemaining)} para o objetivo. Para concluir pelo valor indicado, assinale a opção abaixo. Para um reforço extra, abra a poupança.`);
        }
        action={type:'save',reserveId:reserveForm.id,lineId:forGoal?goalForSaving?.id:undefined,
          amount:cents,date:value('date'),source:savingWithoutTransfer?'':sourceId(),initials:collectInitials(),complete:finishSaving||undefined};
        feedback=finishSaving?`Objetivo do mês concluído para ${reserveForm.name}. Gravação local confirmada.`:
          `${money(cents)} para ${reserveForm.name}. Gravação local confirmada.`;
        break;
      }
      case 'associateSaving':{
        if(!goalForSaving)throw new DomainError('GOAL','Escolha o objetivo.');
        if(!associationOptions.some(e=>e.id===value('savingEvent')))throw new DomainError('SAVING_EVENT','Escolha o reforço a associar.');
        action={type:'associateSaving',lineId:goalForSaving.id,eventId:value('savingEvent'),amount:amount()};
        feedback='Reforço associado ao objetivo. Os saldos mantêm-se.';
        break;
      }
      case 'transfer':validDate(value('date'),m.period);action={type:'transfer',source:sourceId(),destination:sourceId('destination'),amount:amount(),date:value('date'),initials:collectInitials()};break;
      case 'link':
        action={type:'occurrence',id:modal.id!,mode:'link',lineId:value('lineId')};
        feedback='Lembrete associado à despesa existente. Plano e saldos preservados.';
        break;
      case 'recurring':{validName(value('name'));const definition:Recurring={id,name:value('name').trim(),date:value('date'),frequency:value('frequency') as Recurring['frequency'],active:value('active')==='true',amount:value('amount')?amount():null,accountId:value('account')||form.get('account')?accountId():'',reserveId:value('reserve')||undefined};const reminderText=value('reminderText').trim();
        if(reminderText){
          if(!/^\d+$/.test(value('reminderDays')))throw new DomainError('REMINDER','Indique a antecedência em dias inteiros.');
          definition.reminderText=reminderText;
          definition.reminderDays=Number(value('reminderDays'));
        }
        action={type:'recurring',definition};
        feedback='Definição do pagamento recorrente guardada.';
        break;
      }
      case 'account':{
        const name=value('name').trim();
        validName(name);
        if(s.accounts.some(a=>a.id!==id&&a.name===name))throw new DomainError('NAME','Já existe uma conta com esse nome.');
        const account=s.accounts.find(a=>a.id===id);
        action={type:'account',account:{...account,id,name,color:value('color'),restricted:value('restricted')==='true'}};
        break;
      }
      case 'deleteAccount':action={type:'deleteAccount',id};feedback='Conta eliminada.';break;
      case 'reserve':action={type:'reserve',reserve:{id,name:value('name').trim(),accountId:accountId()}};break;
      case 'category':{validName(value('name'));if(s.categories.some(c=>c.id!==id&&c.name===value('name').trim()))throw new DomainError('NAME','Já existe uma categoria com esse nome.');action={type:'category',category:{...s.categories.find(c=>c.id===id),id,name:value('name').trim()}};break;}
    }
    if(action){
      const executionLine=action.type==='line'&&action.line.kind==='expense'&&action.execution?action.line.id:null;
      const confirmation=executionLine?{period:m.period,lineId:executionLine,eventId:modal.requestId}:action.type==='execute'&&selectedLine?.kind==='expense'&&!action.includedInTotal&&
        (!action.total||action.complete||action.amount!==realized(m,action.lineId))
        ?{period:m.period,lineId:action.lineId,eventId:modal.requestId}:null;
      pendingReceipt.current=confirmation;
      const savingDestination=expenseRemainder>0?remainderReserves.find(reserve=>reserve.id===value('remainderReserve')):undefined;
      pendingRemainderSaving.current=action.type==='execute'&&savingDestination
        ?{reserve:savingDestination,amount:expenseRemainder,source:action.source,date:dateDefault(),lineId:action.lineId}:null;
      await run(action,confirmation?'':feedback,modal.requestId,modal.revision);
      if(confirmation)showReceipt(confirmation);
      pendingReceipt.current=null;
      if(showRemainderSaving())return;
      if(action.type==='reserve'){
        setValues(v=>({...v,reserve:action.reserve.id,goalId:'',amount:'',account:action.reserve.accountId,category:'',dueDate:''}));
        setModal({kind:'goal',reserveId:action.reserve.id,optionalGoal:true,requestId:newRequestId(),revision:store.getRevision?.()});
        return;
      }
      if(action.type==='deleteAccount')requestAnimationFrame(()=>document.getElementById('bank-accounts-title')?.focus());
      if(savingFromPlan&&modal.id)focusSavingDetail(modal.id);
    }
    if(modal.kind==='month'&&screen==='base'){setScreen('month');setTab('expense');window.scrollTo({top:0});}
    close();
  }catch(e){if(e instanceof DomainError){pendingReceipt.current=null;pendingRemainderSaving.current=null;}formFailure(e);}}
  function formFailure(e:unknown){
    if(reportConflict(e))return;
    setError((e as Error).message);
    setErrorAttempt(n=>n+1);
    setErrorCode(e instanceof DomainError?e.code:'');
  }
  function focusSavingDetail(lineId:string){
    requestAnimationFrame(()=>{
      const detail=document.getElementById(`detail-${lineId}`);
      const fallback=document.getElementById(screen==='plan'?'tab-saving':'planned-savings-title');
      (detail??fallback)?.focus({preventScroll:true});
    });
  }
  async function safe(action:Action,text:string){if(conflict)return;try{await run(action,text,undefined,modal?.revision??store.revision);}catch(e){if(reportConflict(e))return;if(modal){formFailure(e);}else setGlobalError((e as Error).message);}}
  async function retryPending(){try{
    await store.retry?.();setModal(null);setError('');
    if(savingFromPlan&&modal?.id)focusSavingDetail(modal.id);
    if(pendingReceipt.current){showReceipt(pendingReceipt.current);pendingReceipt.current=null;notify('');}
    else notify('Gravação local confirmada sem duplicar efeitos.');
    showRemainderSaving();
  }catch(e){if(e instanceof DomainError)pendingRemainderSaving.current=null;if(!reportConflict(e)){setError((e as Error).message);setGlobalError((e as Error).message);}}}
  function navigate(next:Screen,target?:string,block:ScrollLogicalPosition='start'){
    setFundingOpen(false);setExpandedMetric(null);setPlanView(defaultMovementView);setScreen(next);setSearch('');setCatalogSearch({account:'',category:''});setNotice('');
    if(!conflict)setGlobalError('');
    window.scrollTo({top:0});
    if(target)requestAnimationFrame(()=>{
      const element=document.getElementById(target);
      element?.focus({preventScroll:true});
      element?.scrollIntoView({block});
    });
  }
  function showPendingPlan(kind:Kind){
    navigate('plan',`tab-${kind}`);
    setTab(kind);setPlanView({...defaultMovementView,status:'pending'});
  }
  function toggleAccount(account:Account){
    return safe({type:'account',account:{...account,archived:!account.archived}},
      account.archived?'Conta reativada.':'Conta desativada. Os registos guardados continuam disponíveis.');
  }
  const accountBadge=(id:string)=><span className="account-badge"><i aria-hidden="true" style={{background:accountColor(s.accounts.find(a=>a.id===id)?.color??'#aaa')}}/>{nameOf(id)}</span>;
  const canRegisterLine=(l:Line)=>l.kind==='saving'?(pending(m,l)??0)>0:!completed(m,l.id);
  const status=(l:Line)=>completed(m,l.id)?(l.kind==='expense'?'Concluída':'Concluído'):
    l.plan!=null&&realized(m,l.id)>l.plan?'Excesso':realized(m,l.id)>0&&pending(m,l)!==0?'Parcial':l.plan==null?'Valor por indicar':l.plan===0?'Previsto a zero':pending(m,l)===0?(l.kind==='saving'?'Objetivo atingido':l.variable?'Orçamento atingido':'Valor previsto atingido'):'Por realizar';
  const tabLines=m.lines.filter(l=>l.kind===tab);
  const plannedCount=tabLines.filter(l=>l.plan!==null).length;
  const initialLineIds=m.snapshot&&new Set(m.snapshot.lines.map(line=>line.id));
  const addedAfterInitial=(line:Line)=>!!initialLineIds&&!initialLineIds.has(line.id);
  const currentView=initialLineIds?planView:{...planView,afterSnapshot:false};
  const hasLineFilters=currentView.status!=='all'||!!currentView.account||!!currentView.category||currentView.afterSnapshot;
  const visibleLines=tabLines.filter(line=>{
    if(currentView.account&&line.accountId!==currentView.account)return false;
    if(currentView.category&&line.categoryId!==currentView.category)return false;
    if(currentView.afterSnapshot&&!addedAfterInitial(line))return false;
    if(currentView.status==='pending')return pending(m,line)!==0;
    if(currentView.status==='done')return completed(m,line.id)||line.plan!==0&&pending(m,line)===0;
    if(currentView.status==='unplanned')return line.plan===null;
    return true;
  });
  const filtered=visibleLines.filter(l=>[l.name,nameOf(l.accountId),s.categories.find(c=>c.id===l.categoryId)?.name??''].some(text=>matchesText(text,search)));
  const visibleReserves=screen==='savings'?s.reserves.filter(reserve=>[reserve.name,nameOf(reserve.accountId)].some(text=>matchesText(text,search)))
    .sort((a,b)=>compareNames(a.name,b.name)):[];
  const filterAccounts=[...s.accounts].sort((a,b)=>compareNames(a.name,b.name));
  const filterCategories=[...s.categories].sort((a,b)=>compareNames(a.name,b.name));
  const principal=s.accounts.filter(a=>!a.restricted).map(a=>aid(a.id));
  const reserves=s.reserves.map(r=>rid(r.id));
  const catalogTotals=[
    {label:'Contas à ordem',keys:principal,unit:'contas',tone:'principal',icon:'accounts'},
    {label:'Poupanças',keys:reserves,unit:'poupanças',tone:'savings',icon:'savings'},
    {label:'Total em contas e poupanças',keys:[...principal,...reserves],unit:'saldos conhecidos',tone:'total',icon:'base'},
  ];
  const noResults=(clear:()=>void)=><div className="empty"><h3>Sem resultados para esta pesquisa</h3><button className="text-button" onClick={clear}>Limpar pesquisa</button></div>;
  const showReserve=(id:string)=>navigate('savings',`reserve-${id}`);

  const movementDate=(l:Line)=>l.dueDate??m.occurrences.find(o=>o.lineId===l.id)?.date??activeEvents(m)
    .filter(e=>e.lineId===l.id&&e.type!=='detail').map(e=>e.date).sort()[0];
  function lineList(lines:Line[],baseKind?:Kind){return <MovementList key={baseKind??(screen==='plan'?tab:'savings')} lines={lines} month={m} base={!!baseKind}
    view={screen==='plan'?{value:currentView,onChange:setPlanView}:undefined}
    bankOf={line=>s.accounts.find(a=>a.id===line.accountId)?.name} categoryOf={line=>s.categories.find(c=>c.id===line.categoryId)?.name} dateOf={movementDate}
    empty={<div className="empty"><h3>{baseKind?'Sem definições deste tipo':'Ainda sem movimentos'}</h3><p>{baseKind?'Adicione uma definição para incluir nos novos meses.':'Adicione uma linha ao plano deste mês.'}</p>{baseKind&&<button className="button small" disabled={busy||uncertain||conflict} onClick={()=>open('line',{target:'base',kind:baseKind})}>{({income:'Adicionar receita',expense:'Adicionar despesa',saving:'Adicionar reforço',investment:'Adicionar investimento'})[baseKind]}</button>}</div>}
    renderRow={l=>{
      const recent=!baseKind&&receipt?.period===m.period&&receipt.lineId===l.id?receipt.eventId:undefined;
       const payment=recent?recentPayment:undefined;
       const saving=l.kind==='saving'&&!baseKind;
       const excess=!baseKind&&l.plan!==null?Math.max(0,realized(m,l.id)-l.plan):0;
      const wideAmounts=!baseKind&&[l.plan,realized(m,l.id),pending(m,l)].some(isLongAmount);
       const date=baseKind?undefined:movementDate(l);
       const reserve=l.reserveId?s.reserves.find(r=>r.id===l.reserveId):undefined;
       const reserveSpent=saving&&reserve?reserveUse(m,reserve.id).spent:0;
       return <article className={`movement${baseKind?' base-row':''}${wideAmounts?' wide-amounts':''}`} key={l.id} data-testid={`line-${l.id}`}>
       <div className="movement-name"><button className="name-button" disabled={busy||uncertain||conflict} onClick={()=>open(baseKind?'line':'detail',{id:l.id,target:baseKind?'base':undefined})}>{l.name}</button><div>{accountBadge(l.accountId)}{reserve&&l.kind==='expense'&&<span className="tiny"> · {sourceName(rid(reserve.id))}</span>}{reserve&&l.kind==='saving'&&reserve.accountId!==l.accountId&&<span className="tiny"> → {nameOf(reserve.accountId)}</span>}{date&&<time className="tiny" dateTime={date}> · {dateLabel(date)}</time>}</div>{!baseKind&&<span className={`status ${completed(m,l.id)?'done':realized(m,l.id)>0?'partial':''}`}>{status(l)}{excess>0&&status(l)!=='Excesso'?` · Excesso de ${money(excess)}`:excess>0?` de ${money(excess)}`:''}{addedAfterInitial(l)?' · Adicionado depois do plano inicial':m.snapshot&&initialPlan(m,l)!==l.plan?' · Plano alterado':''}</span>}{reserveSpent>0&&<span className="reserve-used">Usado da poupança · {money(reserveSpent)}</span>}</div>
       <div className="amount"><small>{baseKind?'Previsto':'Plano atual'}</small>{money(l.plan)}</div>
       {!baseKind&&<><div className="amount realized"><small>Realizado</small>{money(realized(m,l.id))}</div><div className="amount"><small>Falta</small>{money(pending(m,l))}</div></>}
       <div className="line-actions">{baseKind?<button className="button small" disabled={busy||uncertain||conflict} onClick={()=>open('line',{id:l.id,target:'base'})}>Editar</button>:<>
         {canRegisterLine(l)&&<button id={`pay-${l.id}`} data-pay className="button small primary-soft" disabled={busy||uncertain||conflict} onClick={()=>saving?open('save',{id:l.id,reserveId:l.reserveId,returnTo:`detail-${l.id}`}):l.variable?open('payment',{id:l.id}):full(l)}>{l.variable?'Registar':l.kind==='income'?'Receber':saving?'Poupar':l.kind==='investment'?'Investir':'Pagar'}</button>}
         <button id={`detail-${l.id}`} className="icon-button detail-action" aria-label={`Detalhe de ${l.name}`} disabled={busy||uncertain||conflict} onClick={()=>open('detail',{id:l.id})}><span>Detalhe</span><Icon name="arrow" size={17}/></button>
       </>}</div>
       {payment&&receipt&&<PaymentFeedback key={payment.id} lineId={l.id} text={receiptText(payment)} expiresAt={receipt.expiresAt} onView={()=>open('detail',{id:l.id,eventId:payment.id,returnTo:`detail-${l.id}`})}/>}
    </article>;}}/>;}

  const fieldCodes=['NAME','AMOUNT','ACTUAL','MONEY_LIMIT','ACCOUNT','CATEGORY','RESERVE','RESERVE_BALANCE','DUE_DATE','DATE','PERIOD','REMINDER','NOTE','DETAIL','TOTAL_BELOW_PURCHASES','SOURCE','TOTAL_SOURCE','FUNDS','RESTRICTED','DESTINATION','INITIAL_VALUE','GOAL','SAVING_EVENT'];
  const fieldCode=modal?.kind!=='detail'&&(fieldCodes.includes(errorCode)||immediate&&errorCode==='INITIAL')&&
    (errorCode!=='RESERVE_BALANCE'||!!reserveAfterSource)&&
    (modal?.kind!=='save'||errorCode!=='DESTINATION')&&
    (modal?.kind!=='reconcile'||!['SOURCE','FUNDS'].includes(errorCode))?errorCode:'';
  const invalidField=(...codes:string[])=>!!fieldCode&&codes.includes(fieldCode);
  const fieldError=(...codes:string[])=>invalidField(...codes)&&<span id="form-error" role="alert" className="inline-error">{error}</span>;
  const setPlanAccount=(id:string)=>{
    const reserve=s.reserves.find(r=>r.id===value('reserve'));
    if(reserve&&id!==reserve.accountId&&value('kind')!=='saving')set('reserve','');
    set('account',id);
  };
  const reserveCodes=immediate&&value('reserve')?['RESERVE','FUNDS','SOURCE','RESTRICTED','INITIAL']:['RESERVE'];
  const reserveOptions=s.reserves.filter(r=>modal?.kind==='line'&&value('kind')==='expense'
    ?r.accountId===value('account')
    :accounts.some(a=>a.id===r.accountId&&!a.restricted)||r.id===value('reserve'));
  const reserveChoices=s.reserves.map(r=>({id:r.id,name:`${reserveLabel(r)} · ${nameOf(r.accountId)}`}));
  const reserveSelect=<label>{value('kind')==='saving'?'Poupança de destino':'Poupança usada para pagar (opcional)'}<Select
    options={reserveChoices.filter(option=>reserveOptions.some(r=>r.id===option.id))}
    emptyLabel={s.reserves.length&&modal?.kind==='line'&&value('kind')==='expense'?'Sem poupanças nesta conta':'Sem poupanças disponíveis'}
    placeholder={value('kind')==='saving'?'Escolha a poupança':'Sem poupança'} value={value('reserve')}
    aria-invalid={invalidField(...reserveCodes)} aria-describedby={invalidField(...reserveCodes)?'form-error':undefined} onChange={e=>{
    const reserve=s.reserves.find(r=>r.id===e.target.value);
    set('reserve',e.target.value);
    if(reserve&&value('kind')!=='saving')set('account',reserve.accountId);
  }} required={value('kind')==='saving'}/>{fieldError(...reserveCodes)}</label>;
  const focusAmount=((modal?.kind==='payment'||modal?.fromExpenseRemainder&&!!value('source'))&&missingBalances.length===0)||modal?.kind==='initial'||modal?.kind==='reconcile'||modal?.kind==='goal'&&!!reserveForm;
  const amountField=(label='Montante (€)',required=true,hint?:string)=><label>{label}<MoneyInput autoFocus={focusAmount} data-initial-focus={focusAmount||undefined} name="amount" aria-label={label} value={value('amount')} onValue={v=>set('amount',v)} placeholder={required?'0,00':'Por indicar'} required={required} aria-invalid={invalidField('AMOUNT','MONEY_LIMIT','TOTAL_BELOW_PURCHASES')} aria-describedby={invalidField('AMOUNT','MONEY_LIMIT','TOTAL_BELOW_PURCHASES')?'form-error':hint?'amount-hint':undefined}/>{hint&&<small id="amount-hint">{hint}</small>}{fieldError('AMOUNT','MONEY_LIMIT','TOTAL_BELOW_PURCHASES')}{!error&&totalPreviewError?.code==='TOTAL_BELOW_PURCHASES'&&<span className="inline-error">{totalPreviewError.message}</span>}</label>;
  const completionField=<label className="checkbox"><input type="checkbox" checked={finishMovement} onChange={e=>set('complete',e.target.checked?'true':'false')}/>Concluir por este valor, mesmo que diferente do previsto</label>;
  const dateField=<label>{modal?.kind==='recurring'?'Data de referência':'Data'}<input name="date" aria-label={modal?.kind==='recurring'?'Data de referência':'Data'} type="date" value={value('date')} min={modal?.kind==='recurring'?undefined:`${s.selected}-01`} max={modal?.kind==='recurring'?undefined:`${s.selected}-${daysInMonth(Number(s.selected.slice(0,4)),Number(s.selected.slice(5)))}`} aria-invalid={invalidField('DATE')} aria-describedby={invalidField('DATE')?'form-error':undefined} onChange={e=>set('date',e.target.value)} required/>{fieldError('DATE')}</label>;
  const sourceField=(label='Origem',field='source',options=sources)=>{
    const codes=field==='destination'?['DESTINATION']:['SOURCE','TOTAL_SOURCE','FUNDS','RESTRICTED'];
    return <Choice label={label} name={field} options={options} emptyLabel={modal?.otherBank?'Sem outros bancos disponíveis':noAccounts} value={value(field)} onChange={v=>set(field,v)} required invalid={invalidField(...codes)} error={fieldError(...codes)}/>;
  };
  const accountCodes=immediate&&!value('reserve')?['ACCOUNT','FUNDS','SOURCE','RESTRICTED','INITIAL']:['ACCOUNT'];
  const accountLabel=modal?.kind==='recurring'?'Conta (opcional)':modal?.kind==='reserve'?'Banco onde está a poupança':modal?.kind==='goal'?'Banco de onde sai o reforço':
    modal?.kind==='line'?value('kind')==='income'?'Banco onde recebe o dinheiro':'Banco de onde sai o dinheiro':'Conta';
  const accountField=<Choice label={accountLabel} name="account" options={s.accounts.filter(a=>(!a.archived||a.id===value('account'))&&(!(modal?.kind==='goal'||value('kind')==='saving')||!a.restricted))} emptyLabel={noAccounts} value={value('account')} onChange={setPlanAccount} required={modal?.kind!=='recurring'} invalid={invalidField(...accountCodes)} error={fieldError(...accountCodes)}/>;
  const plannedDateField=<label>Data prevista (opcional)<input type="date" value={value('dueDate')} min={`${s.selected}-01`}
    max={`${s.selected}-${daysInMonth(Number(s.selected.slice(0,4)),Number(s.selected.slice(5)))}`} onChange={e=>set('dueDate',e.target.value)}
    aria-invalid={invalidField('DUE_DATE')} aria-describedby={invalidField('DUE_DATE')?'form-error':undefined}/>{fieldError('DUE_DATE')}</label>;
  const categoryField=<Choice label="Categoria" name="category" options={s.categories.filter(c=>!c.archived||c.id===value('category'))} emptyLabel="Sem categorias disponíveis" value={value('category')} onChange={v=>set('category',v)} invalid={invalidField('CATEGORY')} error={fieldError('CATEGORY')}/>;
  const reserveAfterField=reserveAfterSource&&<label>Quanto ficou na poupança após a despesa? (€)
    <MoneyInput value={value(`reserveAfter:${reserveAfterSource}`)} onValue={v=>set(`reserveAfter:${reserveAfterSource}`,v)} placeholder="Opcional"
      aria-invalid={invalidField('RESERVE_BALANCE')} aria-describedby={invalidField('RESERVE_BALANCE')?'form-error':'reserve-after-hint'}/>
    <small id="reserve-after-hint">Indique o total que ficou em {sourceName(reserveAfterSource)} depois de pagar. Em branco, o cálculo parte de {money(defaultReserveInitial(s,m,reserveAfterSource.slice(2)))} antes desta despesa.</small>
    {fieldError('RESERVE_BALANCE')}
  </label>;
  const nameField=<label>Nome<input data-initial-focus aria-label="Nome" value={value('name')} onChange={e=>set('name',e.target.value)} aria-invalid={invalidField('NAME')} aria-describedby={invalidField('NAME')?'form-error':undefined} required/>{fieldError('NAME')}</label>;
  let totalPreview:ReturnType<typeof accumulatedTotal>|undefined;
  let totalPreviewError:DomainError|undefined;
  let proposedTotal:number|undefined;
  if(selectedLine&&modal?.kind==='payment'&&value('mode')==='total'){
    try{
      proposedTotal=parseMoney(value('amount'));
      totalPreview=accumulatedTotal(m,selectedLine.id,proposedTotal,value('source')||undefined);
    }catch(e){if(e instanceof DomainError)totalPreviewError=e;}
  }
  const totalPreviewBox=selectedLine&&<div className="preview total-preview">
    <dl><div><dt>Gasto já registado</dt><dd>{money(realized(m,selectedLine.id))}</dd></div>
      <div><dt>Novo total</dt><dd>{money(proposedTotal)}</dd></div>
      <div><dt>Ajuste ao gasto</dt><dd>{totalPreview?`${totalPreview.adjustment>0?'+':''}${money(totalPreview.adjustment)}`:'Por apurar'}</dd></div>
    </dl>
    {totalPreview&&value('source')&&<p>{totalEffect(totalPreview.adjustment)} · {sourceName(value('source'))}</p>}
    {totalPreviewError?.code==='TOTAL_SOURCE'&&!error&&<p className="inline-error">{totalPreviewError.message}</p>}
  </div>;
  const bankAvailable=value('source')?balance(m,value('source')):null;
  const observedBalance=modal?.source?balance(m,modal.source):null;
  const savingAmount=finishSaving?enteredAmount??0:value('savingMode')==='goal'?Math.min(enteredAmount??0,goalRemaining??0):0;
  const extraAmount=enteredAmount===null?null:enteredAmount-savingAmount;
  const separateBank=!!value('source')&&value('source')!==savingBank;
  const selectableBanks=accounts.filter(a=>!a.restricted).map(a=>({id:aid(a.id),name:a.name}));
  const expensePaymentSources=modal?.otherBank?selectableBanks.filter(a=>a.id!==aid(selectedLine?.accountId??'')):
    selectedLine?.kind==='expense'?sources:sources.filter(a=>a.id.startsWith('a:'));
  const goalOptionLabel=(line:Line,index:number)=>`Compromisso ${index+1} · ${line.name} · ${money(line.plan)} · faltam ${money(pending(m,line))}`;
  const goalSelect=(options:Line[],onChange:(id:string)=>void)=><label>Compromisso do mês<Select
    options={options.map((l,index)=>({id:l.id,name:goalOptionLabel(l,index)}))}
    emptyLabel="Sem compromissos disponíveis" placeholder="Escolha o compromisso" value={value('goalId')}
    onChange={e=>onChange(e.target.value)} aria-invalid={invalidField('GOAL')} aria-describedby={invalidField('GOAL')?'form-error':undefined}/>
    {fieldError('GOAL')}</label>;
  const titles:Record<string,string>={
    month:'Criar ou abrir mês',
    initial:savingsInitial?'Introduzir Total Acumulado da Poupança':'Introduzir saldo inicial',
    reconcile:savingsInitial?'Atualizar montante total poupado':'Atualizar montante',
    payment:modal?.otherBank?'Registar pagamento por outro banco':selectedLine?.variable?'Registar gasto':selectedLine?.kind==='income'?'Registar recebimento':selectedLine?.kind==='investment'?'Registar investimento':'Pagamento parcial ou diferente',
    line:modal?.target?(modal.id?'Editar definição do Modelo Base':'Nova definição do Modelo Base'):modal?.id?'Editar movimento':createLabel[value('kind') as Kind],
    goal:goals.length?'Editar objetivo do mês':modal?.reserveId?'Quanto quer poupar este mês?':'Adicionar poupança ao mês',
    save:'Poupar',associateSaving:'Associar reforço já registado',
    detail:selectedLine?.name??'Detalhe',transfer:'Transferência própria',link:'Associar a movimento existente',
    recurring:modal?.id?'Editar pagamento recorrente':'Novo pagamento recorrente',account:modal?.id?'Editar conta':'Adicionar conta',
    deleteAccount:'Eliminar conta',
    category:modal?.id?'Editar categoria':'Adicionar categoria',reserve:'Criar poupança'
  };

  const nav=(mobile=false)=><nav aria-label="Navegação principal">{navigation.map(n=><button key={n.id} aria-label={n.label} className={screen===n.id?'active':''} onClick={()=>{navigate(n.id);if(mobile)closeMenu();}} aria-current={screen===n.id?'page':undefined}><Icon name={n.icon}/><span>{n.label}</span>{n.id==='recurring'&&<em>{m.occurrences.filter(o=>o.state==='open').length}</em>}</button>)}</nav>;
  return <div className="app-shell" data-ready={ready} aria-busy={busy}>
    <a className="skip-link" href="#main">Saltar para o conteúdo</a>
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Icon name="leaf" size={24}/></span><div>O meu mês<small>UM PLANO, MAIS CLAREZA.</small></div></div><div className="nav-caption">O SEU ESPAÇO</div>{nav()}{showLocalData&&<div className="sidebar-bottom"><span className="local-dot"/> Neste computador<p>Aplicação local</p></div>}</aside>
    <div className="workspace">{(showLocalData||recovery)&&<div className="storage-banner"><span><Icon name="info" size={15}/><strong>{recovery?'Cópia recuperada':'Dados reais'}{showLocalData?' — SQLite':''}</strong>{showLocalData&&<span className="banner-detail">Backup e exportação nas Definições.</span>}</span></div>}
    <header className="topbar"><div className="mobile-navigation" onKeyDown={e=>{if(e.key==='Escape'&&menu){e.preventDefault();closeMenu();}}} onBlur={e=>{if(menu&&!e.currentTarget.contains(e.relatedTarget))setMenu(false);}}>
      <button ref={menuButton} className="button small" aria-expanded={menu} aria-controls="mobile-menu" onClick={()=>menu?closeMenu():setMenu(true)}>Menu</button>
      <div id="mobile-menu" ref={menuPanel} hidden={!menu}>{nav(true)}</div>
    </div><span>O meu espaço <span className="muted">/ {navigation.find(n=>n.id===screen)?.label}</span></span><div className="month-controls"><label className="sr-only" htmlFor="month-select">Mês selecionado</label><select id="month-select" disabled={busy||uncertain||conflict} value={s.selected} onChange={e=>safe({type:'month',period:e.target.value},'Mês selecionado.')} aria-label="Mês selecionado">{Object.keys(s.months).sort().map(p=><option key={p} value={p}>{monthLabel(p)}</option>)}</select><button className="button small" disabled={busy||uncertain||conflict} onClick={()=>open('month')}><Icon name="plus" size={16}/>Novo mês</button></div><strong className="mobile-screen-title" aria-hidden="true">{navigation.find(n=>n.id===screen)?.label}</strong></header>
    <main id="main" tabIndex={-1}>
      <p className="sr-only" role="status" aria-atomic="true">{recentPayment&&`${recentPayment.line?.name??m.lines.find(line=>line.id===recentPayment.lineId)?.name??''} · ${receiptText(recentPayment)}`}</p>
      {store.error&&<p className="form-error" role="alert">{store.error}</p>}
      {busy&&<p className="callout" role="status">A confirmar gravação local…</p>}
      {uncertain&&<div className="callout" role="alert"><p>Gravação por confirmar. A tentativa original foi preservada.</p><button className="button" disabled={busy} onClick={retryPending}>Repetir confirmação</button></div>}
      {globalError&&<div id="workspace-error" className="form-error" role="alert"><p>{globalError}</p>{conflict&&<button className="button" onClick={reloadAfterConflict}>Recarregar para voltar a editar</button>}</div>}
      {notice&&<div className="toast" role="status"><Icon name="check" size={18}/><span>{notice}</span><button aria-label="Fechar mensagem" className="icon-button" onClick={()=>setNotice('')}><Icon name="close" size={16}/></button></div>}
      <div className="page-heading">
        <div><span className="eyebrow">{monthLabel(s.selected)}</span><h1>{navigation.find(n=>n.id===screen)?.label}</h1>
          {screen!=='month'&&<p>{({plan:'Consulte o plano e registe o que já aconteceu.',accounts:'Saldos atuais e compromissos por banco.',savings:'Dinheiro separado por finalidade.',recurring:'Lembretes para não deixar passar subscrições e obrigações.',base:'O ponto de partida dos próximos meses.',settings:'Backups, exportação, contas e categorias.'})[screen]}</p>}
        </div>
        {screen==='month'?<div className="section-links month-quick-links" role="group" aria-label="Atalhos do mês">
          <button className="text-button" onClick={()=>navigate('plan')}>Ver plano e movimentos</button>
          <button className="text-button" onClick={()=>navigate('recurring')}>Rever lembretes <span>{m.occurrences.filter(o=>o.state==='open').length} por rever</span></button>
          <a href="#budget-title">Ver sobras do mês</a>
        </div>:screen==='accounts'?<div className="account-actions">
          <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open('transfer')}><Icon name="transfer" size={17}/>Transferir entre contas</button>
          <button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>open('account')}><Icon name="plus" size={17}/>Adicionar conta</button>
        </div>:screen==='base'?<button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>open('line',{target:'base'})}><Icon name="plus" size={17}/>Adicionar ao modelo</button>:null}
      </div>
      {screen==='month'&&<>
        <section className="metrics" aria-label="Resumo mensal">{([
          {label:'Saldo atual das contas',amount:currentTotal,caption:'Contas à ordem ativas',coverage:balancesKnown.length,
            cause:monthAccounts.length?'Há saldos por indicar.':'Sem contas à ordem ativas.',key:'balance',destination:'Abrir saldos em Contas',go:()=>navigate('accounts','bank-accounts-title')},
          {label:'Despesas por pagar',...expenses,caption:'Inclui despesas a pagar por poupanças',cause:'Há despesas com valor por indicar.',key:'expenses',
            destination:'Abrir despesas por pagar no plano',go:()=>showPendingPlan('expense')},
          {label:hasInvestment?'Poupanças e investimentos':'Poupanças',...savings,caption:'Reforços que ainda faltam',cause:'Há montantes por indicar.',key:'savings',
            destination:'Abrir reforços planeados em Poupanças',go:()=>navigate('savings','planned-savings-title')},
          {label:'Saldo previsto',amount:forecast.amount,caption:forecastLabel,coverage:forecast.knownCount,cause:forecast.cause,
            destination:'Abrir saldos previstos em Contas',go:()=>navigate('accounts','bank-accounts-title')}
        ] as const).map(({label,amount,caption,cause,destination,go,...metric},i)=>{
          const key='key' in metric?metric.key:undefined,coverage='coverage' in metric?metric.coverage:undefined;
          const expanded=!!key&&expandedMetric===key;
          const partial=amount!==null&&'missing' in metric&&metric.missing>0;
          const value=<strong className={isLongAmount(amount)?'long-amount':undefined}>{amount===null?'Por apurar':money(amount)}</strong>;
          return <div className="metric-slot" key={label} ref={expanded?expandedMetricSlot:undefined}
            onBlur={e=>{if(expanded&&!e.currentTarget.contains(e.relatedTarget))setExpandedMetric(null);}}
            onKeyDown={e=>{
              if(expanded&&e.key==='Escape'){
                e.preventDefault();
                e.currentTarget.querySelector<HTMLButtonElement>('.metric-toggle')?.focus({preventScroll:true});
                setExpandedMetric(null);
              }
            }}>
            <article className={`metric ${i===3?'featured':''}`}>
            <div className="metric-heading"><h2 className="metric-title">{label}</h2>
              <button className="icon-button metric-arrow" aria-label={destination} title={destination} onClick={go}><Icon name="arrow" size={18}/></button>
            </div>
            {partial?<div className="subtotal-amount">{value}<span className="subtotal-tag">Ainda há valores por apurar</span></div>:value}
            <small>{caption}</small>
            {amount===null||partial?<small>{cause}</small>:coverage!==undefined&&coverage<monthAccounts.length&&<small>Ainda há valores por apurar · {coverage} de {monthAccounts.length} contas</small>}
            {key&&<button className="text-button metric-toggle" aria-label={`${expanded?'Ocultar':'Ver'} detalhe: ${label}`}
              aria-expanded={expanded} aria-controls={`metric-${key}`} onClick={()=>setExpandedMetric(expanded?null:key)}>
              {expanded?'Ocultar detalhe':'Ver detalhe'} <Icon name="chevron" size={15}/>
            </button>}
          </article>{key&&<div className="metric-detail" id={`metric-${key}`} hidden={!expanded} tabIndex={0} role="region" aria-label={`Detalhe: ${label}`}>
            {key==='balance'?<><p>{balancesKnown.length} de {monthAccounts.length} contas com saldo conhecido.</p>
              <dl>{monthAccounts.map(({account,current})=><div key={account.id}><dt>{account.name}</dt><dd>{current===null?'Saldo por indicar':money(current)}</dd></div>)}</dl></>
              :key==='savings'?savingCommitments.length?<><dl>{savingCommitments.map(({line,amount})=><div key={line.id}>
                <dt>{line.name}</dt><dd>{amount===null?'Valor por apurar':money(amount)}</dd>
              </div>)}</dl>{hasInvestment&&<button className="text-button metric-toggle" onClick={()=>showPendingPlan('investment')}>Ver investimentos no plano<Icon name="arrow" size={15}/></button>}</>:<p>Sem reforços ou investimentos por realizar.</p>
              :expenseGroups.size===0?<p>Sem despesas por pagar.</p>:Array.from(expenseGroups,([source,rows])=><div key={source}>
                <h3>{source?sourceName(source):'Origem por apurar'}</h3>
                <dl>{rows.map(({line,amount})=><div key={line.id}><dt>{line.name}</dt><dd>{amount===null?'Valor por apurar':money(amount)}</dd></div>)}</dl>
              </div>)}
          </div>}</div>;
        })}</section>
        {funding&&<MonthFunding key={m.period} month={m} report={funding}
          reserveLabel={reserve=>`${reserveLabel(reserve)} · ${nameOf(reserve.accountId)}`} reserveWarningText={reserveWarningText}
          onReviewTransfers={()=>navigate('accounts','funding-launch','nearest')} onOpenReserve={showReserve}/>}
        <div className="month-summary-panels">
          <BudgetRemainders month={m} onOpenSavings={()=>navigate('savings')}/>
          <section className="panel" aria-labelledby="month-accounts-title">
            <div className="section-top"><h2 id="month-accounts-title">Saldos atuais e previstos</h2><Icon name="accounts" size={18}/></div>
            <p className="account-summary-caption">Contas à ordem ativas. O saldo previsto desconta as saídas ainda planeadas.</p>
            <div className="account-mini-list">
              {monthAccounts.length===0&&<p className="tiny">Sem contas à ordem ativas.</p>}
              {monthAccounts.map(({account,current,forecast})=><article
                className={`account-mini${[current,forecast].some(isLongAmount)?' wide-amounts':''}`} key={account.id}
                style={{'--account-accent':accountColor(account.color)} as CSSProperties}>
                <h3>{account.name}</h3>
                <dl>{[{label:'Atual',amount:current},{label:'Previsto',amount:forecast}].map(({label,amount})=><div key={label}>
                  <dt>{label}</dt><dd className={amount===null?'balance-unknown':amount<0?'negative':undefined}>{money(amount)}</dd>
                </div>)}</dl>
              </article>)}
            </div>
            <button className="text-button panel-link" onClick={()=>navigate('accounts')}>Ver contas<Icon name="arrow" size={16}/></button>
          </section>
          {upcomingReminders.length>0&&<section className="panel advance-reminders" aria-labelledby="advance-reminders-title">
            <div className="section-top"><h2 id="advance-reminders-title">Lembretes de pagamentos</h2><Icon name="bell" size={18}/></div>
            <ul>{upcomingReminders.map(item=><li key={item.id}><strong>{item.text}</strong><small>{item.name} · pagamento a {dateLabel(item.date)}</small></li>)}</ul>
          </section>}
        </div>
        <div className="plan-bar" id="initial-plan"><div><span><strong>{m.snapshot?`Plano inicial guardado · ${dateLabel(m.snapshot.date)}`:'Plano inicial ainda não guardado'}</strong><small>Referência para comparar com o plano atual.</small></span></div><button className="text-button" disabled={busy||uncertain||conflict||!!m.snapshot} onClick={()=>safe({type:'snapshot',date:calendarDate()},'Plano inicial guardado localmente.')}>{m.snapshot?'Referência preservada':'Guardar plano inicial'}</button></div>
      </>}
      {screen==='plan'&&<>
        <section className="panel plan-movements">
          <div className={`tabs${monthKinds.length>3?' tabs-with-investment':''}`} role="tablist" aria-label="Tipos de movimento">
            {monthKinds.map(k=><button role="tab" key={k} id={`tab-${k}`} aria-selected={tab===k} aria-controls="movement-panel"
              onClick={()=>{setTab(k);setSearch('');}} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
                e.preventDefault();const next=monthKinds[(monthKinds.indexOf(k)+(e.key==='ArrowRight'?1:monthKinds.length-1))%monthKinds.length];
                setTab(next);setSearch('');document.getElementById(`tab-${next}`)?.focus();
              }}} tabIndex={tab===k?0:-1}>{monthKindLabel[k]}<span>{m.lines.filter(l=>l.kind===k).length}</span></button>)}
          </div>
          <div className="plan-total">
            <span>{monthKindTotal[tab]} <small>Plano atual do mês</small></span>
            <div><strong>{tabLines.length&&!plannedCount?'Por apurar':money(planTotal(m,tab))}</strong>
              {plannedCount<tabLines.length&&<small>{plannedCount?`Subtotal · ${plannedCount} de ${tabLines.length} movimentos`:'Valores por indicar no plano'}</small>}
            </div>
          </div>
          <div className="list-toolbar plan-toolbar">
            <SearchField label="Pesquisar movimentos" placeholder="Pesquisar movimento…" value={search} onChange={setSearch}/>
            <div className="plan-toolbar-actions">
              <MovementFilters value={currentView} onApply={setPlanView} hasSnapshot={!!m.snapshot}
                accounts={filterAccounts} categories={filterCategories}/>
              <button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>open(tab==='saving'?'goal':'line',{kind:tab})}>
                <Icon name="plus" size={17}/>{createLabel[tab]}
              </button>
            </div>
          </div>
          <ActiveMovementFilters value={currentView} onRemove={setPlanView} accounts={filterAccounts} categories={filterCategories}/>
          {hasLineFilters&&<div className="plan-filter"><span>{pendingOnly?'A mostrar por realizar':`${filtered.length} de ${tabLines.length} movimentos`}</span><button className="text-button" onClick={()=>setPlanView(defaultMovementView)}>Ver todos os movimentos</button></div>}
          <div id="movement-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {search.trim()&&!filtered.length?noResults(()=>setSearch('')):hasLineFilters&&!filtered.length?<div className="empty">{pendingOnly?'Sem movimentos por realizar.':'Sem movimentos para estes filtros.'}</div>:lineList(filtered)}
          </div>
        </section>
      </>}
      {screen==='accounts'&&funding&&<><AccountFunding report={funding} month={m} open={fundingOpen} onOpenChange={setFundingOpen} busy={busy} uncertain={uncertain} disabled={busy||uncertain||conflict} revision={store.revision} dateDefault={dateDefault()} refresh={store.refresh} retry={store.retry?async()=>{await store.retry!();notify('Gravação local confirmada sem duplicar efeitos.');}:undefined} onPrepare={(account,amount,source,date)=>{open('transfer',{returnTo:'funding-launch'});setValues(v=>({...v,source:aid(source.id),destination:aid(account.id),amount:inputMoney(amount),date}));}} onRecord={(action,revision)=>run(action,`${action.routes.length} ${action.routes.length===1?'transferência registada':'transferências registadas'} localmente.`,undefined,revision)}/><section className="metrics account-totals" aria-label="Totais de contas e poupanças">
          {catalogTotals.map(({label,keys,unit,tone,icon})=>{
            const amounts=keys.flatMap(key=>{const current=balance(m,key);return current===null?[]:[current];});
            const total=amounts.length||!keys.length?sum(amounts):null;
            return <article className={`metric account-total account-total-${tone}`} key={label}>
              <div className="metric-heading"><h2 className="metric-title">{label}</h2><span className="account-total-icon"><Icon name={icon} size={18}/></span></div>
              <strong className={isLongAmount(total)?'long-amount':undefined}>{total===null?'Por apurar':money(total)}</strong>
              <small>{amounts.length<keys.length&&total!==null?'Subtotal · ':''}{amounts.length} de {keys.length} {unit}{unit==='saldos conhecidos'?'':' com saldo conhecido'}</small>
              {label==='Poupanças'&&<button className="text-button metric-toggle" onClick={()=>navigate('savings')}>Ver poupanças <Icon name="arrow" size={15}/></button>}
            </article>;
          })}
        </section>
        <section className="bank-accounts" aria-labelledby="bank-accounts-title">
          <div className="bank-accounts-heading"><h2 id="bank-accounts-title" tabIndex={-1}>Contas bancárias</h2><p>Saldos, compromissos e gestão de cada conta.</p></div>
          {!s.accounts.length&&<div className="empty">Ainda não tem contas bancárias.</div>}
          <div className="account-grid">{s.accounts.map(a=>{
            const source=aid(a.id),b=balance(m,source),commit=obligations(m,source);
            const deletable=canDeleteAccount(s,a.id);
            return <article className="panel account-card" key={a.id}>
              <div className="section-top">{accountBadge(a.id)}<span className="pill">{a.archived?'Desativada':a.restricted?'Uso restrito':'Conta principal'}</span></div>
              <strong className="balance-value">{money(b)}</strong><span className="tiny">Saldo calculado</span>
              <dl><div><dt>Saldo inicial</dt><dd>{money(m.initials[source])}</dd></div><div><dt>Efeitos realizados</dt><dd>{money(effects(m,source))}</dd></div>
                <div><dt>{hasInvestment?'Despesas, poupanças e investimentos por realizar':'Despesas e poupanças por realizar'}</dt><dd>{money(commit)}</dd></div>
                <div><dt>Saldo previsto</dt><dd className={b!=null&&commit!=null&&b-commit<0?'negative':''}>{money(b==null||commit==null?null:b-commit)}</dd></div></dl>
              {b!=null&&commit!=null&&b<commit&&<p className="warning">Fundos insuficientes nesta conta.</p>}
              <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open(b==null?'initial':'reconcile',{source})}>{b==null?'Introduzir saldo inicial':'Atualizar montante'}</button>
              <details><summary>Ver movimentos da conta</summary>{history(source)}</details>
              <details className="account-management"><summary>Gerir conta</summary>
                <p>{a.archived?'Fora das novas seleções de conta.':'Pode retirar esta conta das novas seleções.'} Os registos guardados continuam disponíveis.</p>
                <div className="account-actions">
                  <button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>open('account',{id:a.id})}>Editar conta</button>
                  <button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>toggleAccount(a)}>{a.archived?'Reativar':'Desativar'}</button>
                  <button className={`text-button${deletable?' danger':''}`} disabled={!deletable||busy||uncertain||conflict} onClick={()=>open('deleteAccount',{id:a.id})}>Eliminar conta</button>
                </div>
                {!deletable&&<p>Disponível para eliminação quando a conta nunca foi usada em saldos ou movimentos e está sem referências no plano, nas poupanças e nos lembretes.</p>}
              </details>
            </article>;
          })}</div>
        </section>
      </>}
      {screen==='savings'&&<>
        <div className="savings-toolbar">
          <SearchField label="Pesquisar poupanças" placeholder="Pesquisar poupança ou banco…" value={search} onChange={setSearch}/>
          <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open('reserve')}>Criar poupança</button>
        </div>
        <div className="callout savings-explainer"><Icon name="leaf"/><p>Quando põe dinheiro numa poupança, o saldo disponível na conta à ordem baixa e o saldo da poupança aumenta. Se pagar uma despesa com esse dinheiro, o valor é descontado da poupança.</p></div>
        {!s.reserves.length&&<div className="empty"><h2>Ainda não tem poupanças</h2><p>Crie uma poupança para indicar o saldo acumulado e definir um objetivo para o mês.</p></div>}
        {s.reserves.length>0&&!visibleReserves.length&&noResults(()=>setSearch(''))}
        <div className="account-grid">{visibleReserves.map(r=>{
          const key=rid(r.id),b=balance(m,key),goalLines=savingGoals(m,r.id),progress=savingProgress(m,r.id);
          const extra=sum(activeEvents(m).map(e=>freeSaving(m,e,r.id)));
          const warning=reserveWarnings.find(row=>row.reserve.id===r.id);
          const canAssociate=goalLines.some(l=>(pending(m,l)??0)>0&&activeEvents(m).some(e=>
            freeSaving(m,e,r.id)>0&&!activeEvents(m).some(x=>x.savingParentId===e.id&&x.lineId===l.id)));
          return <article className="panel account-card savings-card" id={`reserve-${r.id}`} tabIndex={-1} key={r.id}>
            <div className="section-top"><h2>{reserveLabel(r)}</h2><Icon name="savings"/></div>{accountBadge(r.accountId)}
            <strong className="balance-value">{money(b??defaultReserveInitial(s,m,r.id))}</strong><span className="tiny">Total acumulado da poupança{b===null?' · estimativa por confirmar':''}</span>
            <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open(b===null?'initial':'reconcile',{source:key})}>
              {b===null?'Introduzir Total Acumulado da Poupança':'Atualizar montante total poupado'}
            </button>
            <dl className="savings-progress">
              <div><dt>Objetivo do mês</dt><dd>{goalLines.length?money(progress.target):'Por definir'}</dd></div>
              <div><dt>Já poupado para o objetivo</dt><dd>{money(progress.saved)}</dd></div>
              <div><dt>Falta poupar</dt><dd>{goalLines.length?money(progress.remaining):'Por definir'}</dd></div>
              <div><dt>Reforços extra deste mês</dt><dd>{money(extra)}</dd></div>
              <div><dt>Retirado este mês</dt><dd>{money(reserveUse(m,r.id).withdrawn)}</dd></div>
            </dl>
            {warning&&<p className="warning">{reserveWarningText(warning)}</p>}
            <button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>open('goal',{reserveId:r.id})}>{goalLines.length?'Editar objetivo do mês':'Quanto quer poupar este mês?'}</button>
            <button className="button primary-soft" disabled={busy||uncertain||conflict} onClick={()=>open('save',{reserveId:r.id})}>Poupar</button>
            {canAssociate&&<button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>open('associateSaving',{reserveId:r.id})}>Associar reforço já registado</button>}
            <details><summary>Histórico da poupança</summary>{history(key)}</details>
          </article>;
        })}</div>
        <section className="panel spaced" aria-labelledby="planned-savings-title">
          <div className="section-top"><h2 id="planned-savings-title" tabIndex={-1}>Reforços planeados para este mês</h2>
            <button className="text-button" onClick={()=>{navigate('plan');setTab('saving');}}>Abrir no plano<Icon name="arrow" size={16}/></button>
          </div>{lineList(m.lines.filter(l=>l.kind==='saving'))}
        </section>
      </>}
      {screen==='recurring'&&<RecurringPayments state={s} month={m} disabled={busy||uncertain||conflict}
        onEdit={id=>open('recurring',{id})} onLink={id=>open('link',{id})}
        onResolve={(id,mode)=>safe({type:'occurrence',id,mode},mode==='add'?'Despesa adicionada ao plano. O pagamento continua por registar.':'Lembrete dispensado apenas neste mês.')}
        onView={id=>{navigate('plan');setTab('expense');open('detail',{id});}}/>}
      {screen==='base'&&<><div className="callout"><Icon name="base"/><p>Os novos meses começam com estas definições. As alterações aplicam-se aos meses que ainda vai criar.</p></div>
        <div className="section-links">{modelKinds.map(k=><a key={k} href={`#base-${k}`}>{kindLabel[k]}</a>)}</div>
        {modelKinds.map(k=><section className="panel spaced monthly-section" id={`base-${k}`} key={k}>
          <div className="section-top"><h2>{kindLabel[k]}</h2><span className="tiny">{s.base.filter(l=>l.kind===k).length} no modelo</span></div>
          {k==='income'&&<p className="panel-intro">Inclua aqui salários e outros rendimentos mensais. Entram no plano de cada novo mês e somam ao saldo quando registar o recebimento.</p>}
          {lineList(s.base.filter(l=>l.kind===k),k)}
        </section>)}</>}
      {screen==='settings'&&<><div className="callout"><Icon name="info"/><p>Desativar uma conta ou arquivar uma categoria retira-a das novas seleções e preserva as referências existentes.</p></div><div className="settings-grid">{(['account','category'] as const).map(type=>{
        const items=type==='account'?s.accounts:s.categories;
        const update=(filter:string)=>setCatalogSearch(previous=>({...previous,[type]:filter}));
        const visible=items.filter(item=>matchesText(item.name,catalogSearch[type])).sort((a,b)=>compareNames(a.name,b.name));
        return <section className="panel" key={type}><div className="section-top"><h2>{type==='account'?'Contas':'Categorias'}</h2><button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>open(type)}><Icon name="plus" size={16}/>Adicionar</button></div><SearchField className="catalog-search" label={`Pesquisar ${type==='account'?'contas':'categorias'}`} placeholder="Pesquisar…" value={catalogSearch[type]} onChange={update}/>{!items.length?<div className="empty">Ainda sem {type==='account'?'contas':'categorias'}</div>:!visible.length?noResults(()=>update('')):visible.map(item=><div className="catalog-row" key={item.id}><span>{type==='account'?accountBadge(item.id):item.name}{item.archived&&<small> · {type==='account'?'Desativada':'Arquivada'}</small>}</span><div><button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>open(type,{id:item.id})}>Editar</button><button className="text-button muted" disabled={busy||uncertain||conflict} onClick={()=>type==='account'?toggleAccount(s.accounts.find(a=>a.id===item.id)!):safe({type:'category',category:{...item,archived:!item.archived}},item.archived?'Categoria reativada.':'Categoria arquivada. Referências preservadas.')}>{item.archived?'Reativar':type==='account'?'Desativar':'Arquivar'}</button></div></div>)}</section>;})}</div>
        {showLocalData&&<LocalFiles/>}
      </>}
      <footer className="page-footer"><span>O meu mês <span>·</span> Cada mês, um novo ponto de partida.</span>{showLocalData&&<span>SQLite local</span>}</footer>
    </main></div>
    {modal&&<Dialog title={titles[modal.kind]} onClose={close} returnTo={modal.returnTo}>{conflict&&<div className="callout" role="alert"><p>Os dados mudaram desde que abriu esta edição.</p><button className="button" onClick={reloadAfterConflict}>Recarregar para voltar a editar</button></div>}{busy&&<p className="callout" role="status">A confirmar gravação local…</p>}{uncertain&&<div className="callout"><p>Resposta por confirmar. Repita a mesma tentativa com segurança.</p><button className="button" disabled={busy} onClick={retryPending}>Repetir confirmação</button></div>}{modal.kind==='detail'&&selectedLine?<>
      <div className="dialog-body"><div className="detail-subheading">{accountBadge(selectedLine.accountId)}<span className="pill">{status(selectedLine)}</span></div><dl className="detail-values"><div><dt>Plano inicial {m.snapshot?`· ${dateLabel(m.snapshot.date)}`:'· ainda não guardado'}</dt><dd>{m.snapshot?money(initialPlan(m,selectedLine)):'Sem referência'}</dd></div><div><dt>{selectedLine.kind==='saving'?'Objetivo do mês':'Plano atual'}</dt><dd>{money(selectedLine.plan)}</dd></div>{selectedReminder&&<div><dt>Data do lembrete</dt><dd>{dateLabel(selectedReminder.date)}</dd></div>}{m.snapshot?.reminderDates?.[selectedLine.id]&&<div><dt>Data na referência inicial</dt><dd>{dateLabel(m.snapshot.reminderDates[selectedLine.id])}</dd></div>}<div><dt>{selectedLine.kind==='saving'?'Já poupado para o objetivo':'Realizado'}</dt><dd>{money(realized(m,selectedLine.id))}</dd></div><div><dt>{selectedLine.kind==='saving'?'Falta poupar':'Por realizar'}</dt><dd>{money(pending(m,selectedLine))}</dd></div><div><dt>Desvio realizado face ao plano atual</dt><dd>{selectedLine.plan==null?'Por indicar':`${realized(m,selectedLine.id)>selectedLine.plan?'+':''}${money(realized(m,selectedLine.id)-selectedLine.plan)}`}</dd></div>{m.snapshot&&<div><dt>Alteração do plano face ao inicial</dt><dd>{selectedLine.plan==null||initialPlan(m,selectedLine)==null?'Por indicar':money(selectedLine.plan-initialPlan(m,selectedLine)!)}</dd></div>}</dl>{m.snapshot&&!m.snapshot.lines.some(l=>l.id===selectedLine.id)&&<p className="warning">Adicionado depois do plano inicial. Referência inicial: 0,00 €.</p>}<div className="detail-buttons">
        {canRegisterLine(selectedLine)&&<button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>selectedLine.kind==='saving'
          ?open('save',{id:selectedLine.id,reserveId:selectedLine.reserveId,returnTo:`detail-${selectedLine.id}`})
          :open('payment',{id:selectedLine.id,returnTo:`detail-${selectedLine.id}`})}>
          {selectedLine.kind==='saving'?'Poupar':selectedLine.variable?'Registar compra / total':selectedLine.kind==='expense'?'Parcial ou diferente':selectedLine.kind==='income'?'Registar recebimento':'Registar investimento'}
        </button>}
        <button className="button" disabled={busy||uncertain||conflict} onClick={()=>selectedLine.kind==='saving'
          ?open('goal',{id:selectedLine.id,reserveId:selectedLine.reserveId,returnTo:`detail-${selectedLine.id}`})
          :open('line',{id:selectedLine.id,returnTo:`detail-${selectedLine.id}`})}>
          {selectedLine.kind==='saving'?'Editar objetivo do mês':'Editar plano atual'}
        </button>
      </div>
      {selectedLine.kind==='expense'&&!completed(m,selectedLine.id)&&<div className="other-bank">
        <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open('payment',{id:selectedLine.id,otherBank:true,returnTo:`detail-${selectedLine.id}`})}>Registar pagamento por outro banco</button>
        <p className="tiny">Use esta opção se pagou a despesa a partir de um banco diferente do previsto. O montante será descontado no banco que indicar.</p>
      </div>}{m.snapshot&&<p className="tiny">Referência guardada: {m.snapshot.lines.find(l=>l.id===selectedLine.id)?.name??'Linha adicionada depois'} · {m.snapshot.catalog.accounts.find(a=>a.id===m.snapshot!.lines.find(l=>l.id===selectedLine.id)?.accountId)?.name??'Conta por indicar'} · {m.snapshot.catalog.categories.find(c=>c.id===m.snapshot!.lines.find(l=>l.id===selectedLine.id)?.categoryId)?.name??'Categoria por indicar'}</p>}<h3 className="spaced">Registos e correções</h3>{history(undefined,selectedLine.id)}{error&&<p id="form-error" role="alert" className="form-error">{error}</p>}</div><div className="dialog-footer"><button className="button" onClick={close}>Fechar</button></div>
    </>:<form key={modal.requestId} onSubmit={submit} noValidate aria-busy={busy}><fieldset className="form-fields" disabled={busy||uncertain}><div className="dialog-body">
      <InitialBalances sources={missingBalances} values={values} errorSource={initialErrorSource} error={error} onChange={(source,value)=>set(`initial:${source}`,value)}/>
      {modal.kind==='deleteAccount'&&<p>Eliminar definitivamente <strong>{nameOf(modal.id!)}</strong>? Para voltar a usá-la, terá de adicionar uma conta nova.</p>}

      {modal.kind==='month'&&<><label>Mês<input data-initial-focus type="month" name="period" aria-label="Mês" value={value('period')} onChange={e=>set('period',e.target.value)} aria-invalid={invalidField('PERIOD')} aria-describedby={invalidField('PERIOD')?'form-error':undefined} required/>{fieldError('PERIOD')}</label>
        <p className="preview" aria-live="polite">{s.months[value('period')]?'Já existe. Vai reabrir o plano, os lembretes e os registos guardados.':`Mês novo · ${s.base.length} definições do Modelo Base. ${precedingMonth(s,value('period'))?'Usa os saldos conhecidos das contas no mês anterior.':'Sem mês anterior, os saldos das contas ficam por indicar.'} As receitas entram como previstas.`}</p></>}
      {['initial','reconcile'].includes(modal.kind)&&<>
        <p className="scope-label"><strong>{sourceName(modal.source!)}</strong></p>
        {amountField(savingsInitial?'Total que vê hoje no banco (€)':modal.kind==='initial'?'Saldo inicial deste mês (€)':'Saldo observado no banco (€)',!(savingsInitial&&modal.kind==='initial'))}
        {suggestedBalance&&<p className="preview">Sugestão editável · saldo calculado em {monthLabel(suggestedBalance.period)}: {money(suggestedBalance.amount)}. Confirme o total que vê hoje no banco.</p>}
        {savingsInitial&&<p className="preview">Indique todo o dinheiro disponível nesta poupança à data de hoje. {observedBalance===null?`Se deixar em branco, é usado ${money(defaultReserveInitial(s,m,modal.source!.slice(2)))}.`:`Saldo calculado: ${money(observedBalance)}.`}
          {observedBalance!==null&&enteredAmount!==null&&<> Diferença a registar: {money(sum([enteredAmount,-observedBalance]))}.</>}
        </p>}
        {modal.kind==='reconcile'&&<>{dateField}<label>Motivo da diferença<input name="note" aria-invalid={invalidField('NOTE')} aria-describedby={invalidField('NOTE')?'form-error':undefined} value={value('note')} onChange={e=>set('note',e.target.value)} placeholder="Ex.: diferença identificada na conferência" required/>{fieldError('NOTE')}</label>
          {!savingsInitial&&<p className="preview">Saldo calculado: {money(observedBalance)}. A diferença fica no histórico.</p>}
        </>}
        {modal.kind==='initial'&&!savingsInitial&&<p className="preview">Indique o saldo da conta à ordem, separado das poupanças.</p>}
      </>}
      {modal.kind==='payment'&&selectedLine&&<><p><strong>{selectedLine.name}</strong> · previsto {money(selectedLine.plan)} · falta {money(pending(m,selectedLine))}</p>{selectedLine.variable&&!modal.otherBank&&<label>Tipo de registo<select value={value('mode')} onChange={e=>{set('mode',e.target.value);set('amount',e.target.value==='total'?inputMoney(realized(m,selectedLine.id)):'' );}}><option value="purchase">Compra individual</option><option value="total">Total acumulado</option><option value="detail">Detalhar compra já incluída num total</option></select></label>}{selectedLine.variable&&value('mode')!=='total'&&<label>Nome da compra (opcional)<input value={value('description')} onChange={e=>set('description',e.target.value)} placeholder="Ex.: Continente ou Mercearia" maxLength={120}/></label>}{value('mode')==='detail'&&<><label>Ajuste que já inclui esta compra<Select options={activeEvents(m).filter(e=>e.lineId===selectedLine.id&&e.type==='total'&&e.amount>0&&totalUnallocated(m,e)>0).map(e=>({id:e.id,name:`${dateLabel(e.date)} · ${money(totalUnallocated(m,e))} por detalhar · ${Object.keys(e.deltas).map(sourceName).join(', ')}`}))} emptyLabel="Sem ajustes por detalhar" placeholder="Escolha o ajuste" aria-invalid={invalidField('DETAIL')} aria-describedby={invalidField('DETAIL')?'form-error':undefined} value={value('totalId')} onChange={e=>set('totalId',e.target.value)} required/>{fieldError('DETAIL')}</label><p className="preview">Use a mesma origem do ajuste. Este detalhe identifica uma compra já contabilizada e não aumenta o gasto nem volta a descontar dinheiro.</p></>}{amountField(value('mode')==='total'?'Total gasto até à data (€)':'Montante (€)')}<div className="form-two">{dateField}{sourceField(selectedLine.kind==='income'?'Banco onde recebe o dinheiro':modal.otherBank?'Banco de onde saiu o dinheiro':'Origem do dinheiro','source',expensePaymentSources)}</div>{selectedLine.kind==='expense'&&value('mode')!=='detail'&&<p className="tiny">Escolha a conta ou poupança que usou. No plano: {sourceName(selectedLine.reserveId?rid(selectedLine.reserveId):aid(selectedLine.accountId))}.</p>}{selectedLine.kind==='saving'&&<p className="preview">Destino: {sourceName(rid(selectedLine.reserveId!))}. Não conta como despesa.</p>}{selectedLine.kind==='investment'&&<p className="preview">A aplicação reduz o saldo da conta principal e fica no histórico. O valor da carteira não é acompanhado nesta aplicação.</p>}{value('mode')==='total'&&totalPreviewBox}{!selectedLine.variable&&value('mode')!=='detail'&&completionField}<p className="tiny">O estado e o saldo mudam após confirmar. Pode anular o registo no detalhe para o corrigir.</p></>}
      {expenseRemainder>0&&remainderReserves.length>0&&<div className="preview expense-remainder">
        <p>Sobraram <strong>{money(expenseRemainder)}</strong> do valor previsto.</p>
        <label>Para que poupança quer mover a sobra?<Select
          options={remainderReserves.map(reserve=>({id:reserve.id,name:`${reserveLabel(reserve)} · ${nameOf(reserve.accountId)}`}))}
          emptyLabel="Sem poupanças disponíveis" placeholder="Não mover a sobra" value={value('remainderReserve')}
          onChange={event=>set('remainderReserve',event.target.value)}/></label>
        {value('remainderReserve')&&<p>Pode confirmar o reforço depois de guardar a despesa.</p>}
      </div>}
      {modal.kind==='payment'&&reserveAfterField}
      {modal.kind==='line'&&<>
        {nameField}
        {modal.target&&<label>Tipo<select value={value('kind')} onChange={e=>{set('kind',e.target.value);set('reserve','');}}><option value="expense">Despesa</option><option value="income">Receita</option><option value="saving">Reforço de poupança</option><option value="investment">Investimento</option></select></label>}
        {value('kind')==='expense'&&<label>Tipo de despesa<select value={value('variable')||'false'} onChange={e=>set('variable',e.target.value)}>
          <option value="false">Despesa de valor definido</option><option value="true">Despesa com várias compras</option>
        </select><small>{value('variable')==='true'?'Registe cada compra ou atualize o total gasto, por exemplo em Comida.':'Pode registar um pagamento único ou pagar em prestações.'}</small></label>}
        {!modal.target&&!modal.id&&['expense','income'].includes(value('kind'))&&<label>Estado do registo<select value={value('when')||'pending'} onChange={e=>set('when',e.target.value)}>
          <option value="pending">{value('kind')==='income'?'Ainda espero receber':'Ainda por pagar'}</option>
          <option value="done">{value('kind')==='income'?'Já recebi':'Já paguei'}</option>
        </select></label>}
        {amountField(modal.target?'Montante habitual (€) · opcional':
          value('kind')==='expense'?(value('variable')==='true'?'Orçamento total da despesa (€)':'Valor total da despesa (€)'):
          immediate?'Montante recebido (€)':'Montante previsto (€)',
          !!immediate&&value('variable')!=='true',immediate&&value('variable')!=='true'?undefined:'Deixe em branco se ainda não sabe o valor.')}
        {immediate&&value('variable')==='true'&&<>
          <label>Montante da compra (€)<MoneyInput value={value('actual')} onValue={v=>set('actual',v)}
            aria-invalid={invalidField('ACTUAL')} aria-describedby={invalidField('ACTUAL')?'form-error':undefined} required/>{fieldError('ACTUAL')}</label>
          <label>Nome da compra (opcional)<input value={value('description')} onChange={e=>set('description',e.target.value)} maxLength={120}/></label>
        </>}
        {immediate&&dateField}{!immediate&&!modal.target&&plannedDateField}{accountField}
        {(value('kind')!=='income'||modal.target)&&categoryField}
        {(value('kind')==='saving'||value('kind')==='expense')&&reserveSelect}
        {reserveAfterField}
        {modal.id&&<button type="button" className="text-button danger" onClick={async()=>{try{await run({type:'removeLine',id:modal.id!,target:modal.target},modal.target?'Definição removida do Modelo Base.':'Movimento removido do plano atual.',modal.requestId,modal.revision);close();}catch(e){formFailure(e);}}}>Remover do {modal.target==='base'?'Modelo Base':'plano atual'}</button>}
      </>}
      {modal.kind==='goal'&&<>
        {!modal.reserveId&&<><label>Poupança<Select options={reserveChoices} emptyLabel="Sem poupanças disponíveis" placeholder="Escolha a poupança"
          data-initial-focus value={value('reserve')} aria-invalid={invalidField('RESERVE')} aria-describedby={invalidField('RESERVE')?'form-error':undefined} onChange={e=>{
          const id=e.target.value,existing=savingGoals(m,id),goal=existing.length===1?existing[0]:undefined;
          set('reserve',id);set('goalId',goal?.id??'');
          set('amount',inputMoney(goal?.plan));set('account',goal?.accountId??s.reserves.find(r=>r.id===id)?.accountId??'');
          set('category',goal?.categoryId??'');set('dueDate',goal?.dueDate??'');
        }}/>{fieldError('RESERVE')}</label>
          <button type="button" className="text-button" onClick={()=>open('reserve')}>Criar poupança</button></>}
        {reserveForm&&<><p><strong>{reserveLabel(reserveForm)}</strong> · {nameOf(reserveForm.accountId)}</p>
          {goals.length>1&&goalSelect(goals,id=>{
            const goal=goals.find(l=>l.id===id);
            set('goalId',id);set('amount',inputMoney(goal?.plan));set('account',goal?.accountId??reserveForm.accountId);
            set('category',goal?.categoryId??'');set('dueDate',goal?.dueDate??'');
          })}
          {amountField('Quanto quer poupar este mês? (€)',!modal.optionalGoal,modal.optionalGoal?'Pode definir o objetivo mais tarde.':undefined)}
          {accountField}{categoryField}{plannedDateField}
          <p className="preview">O reforço está previsto para sair do banco que escolher. A poupança está em {nameOf(reserveForm.accountId)}.</p>
        </>}
      </>}
      {modal.kind==='save'&&reserveForm&&<>
        {modal.fromExpenseRemainder&&<p role="status">Despesa registada. Confirme o reforço quando o tiver efetuado no banco.</p>}
        <p><strong>{reserveLabel(reserveForm)}</strong> · Poupança em {nameOf(reserveForm.accountId)}</p>
        {!savingFromPlan&&<label>Tipo de reforço<select value={value('savingMode')} onChange={e=>{set('savingMode',e.target.value);set('amount',e.target.value==='goal'?inputMoney(goalRemaining):'');if(e.target.value==='goal'&&goalForSaving)set('source',aid(goalForSaving.accountId));}}>
          {openGoals.length>0&&<option value="goal">Poupar para o objetivo do mês</option>}
          <option value="extra">Reforço extra</option>
        </select></label>}
        {value('savingMode')==='goal'&&(!savingFromPlan&&openGoals.length>1?goalSelect(openGoals,id=>{
          const goal=openGoals.find(l=>l.id===id);
          set('goalId',id);set('amount',inputMoney(goal?pending(m,goal):null));if(goal)set('source',aid(goal.accountId));
        }):<p>Falta poupar {money(goalRemaining)} para o objetivo.</p>)}
        {!savingWithoutTransfer&&<>{sourceField('De que banco sai o dinheiro?','source',selectableBanks)}
          <p aria-live="polite">{value('source')?<>{sourceName(value('source'))} · {bankAvailable===null?'Saldo por indicar':`${money(bankAvailable)} disponíveis`}</>:'Escolha o banco que fez o débito.'}</p>
        </>}
        <div className="form-two">{amountField()}{dateField}</div>
        {savingFromPlan&&completionField}
        <div className="preview saving-preview">
          <h3>Efeitos do registo</h3>
          {savingWithoutTransfer?<p>O objetivo do mês fica concluído sem alteração aos saldos.</p>:<>
          {separateBank&&<p>Transferência própria de {sourceName(value('source'))} para {nameOf(reserveForm.accountId)}: {money(enteredAmount)}.</p>}
          <p>Reforço de {nameOf(reserveForm.accountId)} para {reserveLabel(reserveForm)}: {money(enteredAmount)}.</p>
          {savingAmount>0&&<p>{money(savingAmount)} para o objetivo do mês.</p>}
          {!savingFromPlan&&extraAmount!==null&&extraAmount>0&&<p>{money(extraAmount)} de reforço extra.</p>}
          <p>Registe aqui as operações que efetuou no banco. Se já registou a transferência, escolha o banco onde o dinheiro já se encontra.</p>
          </>}
        </div>
      </>}
      {modal.kind==='associateSaving'&&reserveForm&&<>
        <p><strong>{reserveLabel(reserveForm)}</strong> · {monthLabel(m.period)}</p>
        {goalSelect(openGoals,id=>{set('goalId',id);set('savingEvent','');set('amount','');})}
        <label>Reforço registado<Select options={associationOptions.map((e,index)=>({id:e.id,name:`${dateLabel(e.date)} · ${money(e.deltas[savingSource])} · ${money(freeSaving(m,e,reserveForm.id))} por associar · Registo ${index+1}`}))}
          emptyLabel="Sem reforços disponíveis" placeholder="Escolha o reforço" value={value('savingEvent')} onChange={e=>{
          const entry=associationOptions.find(event=>event.id===e.target.value);
          set('savingEvent',e.target.value);set('amount',entry&&goalForSaving?inputMoney(Math.min(freeSaving(m,entry,reserveForm.id),pending(m,goalForSaving)??0)):'');
        }} aria-invalid={invalidField('SAVING_EVENT')} aria-describedby={invalidField('SAVING_EVENT')?'form-error':undefined}/>
        {fieldError('SAVING_EVENT')}</label>
        {amountField('Montante a associar (€)')}
        <p className="preview">A associação atualiza o objetivo. O saldo do banco e o total acumulado da poupança mantêm-se.</p>
      </>}
      {modal.kind==='transfer'&&<><p>Operação entre contas próprias ou poupanças. Não cria receita nem despesa. A devolução de uma poupança à conta principal é uma transferência distinta.</p>{sourceField()}{sourceField('Destino','destination')}{value('destination')&&<p className="preview">Destino do registo · <strong>{sourceName(value('destination'))}</strong></p>}{amountField()}{dateField}</>}
      {modal.kind==='link'&&reminder&&<>
        <p><strong>{reminder.name}</strong> · {dateLabel(reminder.date)} · {money(reminder.amount)}</p>
        <label>Movimento existente<Select options={linkOptions.map(l=>({id:l.id,name:`${l.name} · ${nameOf(l.accountId)} · ${money(l.plan)}`}))}
          emptyLabel="Sem despesas para associar" placeholder="Escolha uma despesa"
          data-initial-focus value={value('lineId')} onChange={e=>set('lineId',e.target.value)} required/></label>
        {linkTarget&&<p className="preview"><strong>{linkTarget.name}</strong><br/>{nameOf(linkTarget.accountId)} · {money(linkTarget.plan)} previstos</p>}
        <p>A associação usa a despesa selecionada. O plano e os saldos mantêm os mesmos valores.</p>
      </>}
      {modal.kind==='recurring'&&<>{nameField}<div className="form-two">{dateField}<label>Periodicidade<select value={value('frequency')} onChange={e=>set('frequency',e.target.value)}><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label></div>
        {amountField('Montante previsto (€) · opcional',false)}{accountField}{reserveSelect}
        <label className="checkbox"><input type="checkbox" checked={value('active')==='true'} onChange={e=>set('active',e.target.checked?'true':'false')}/>Gerar lembretes nos novos meses</label>
        <div className="advance-reminder-fields">
          <label>Lembrete no painel (opcional)<input value={value('reminderText')} onChange={e=>set('reminderText',e.target.value)} placeholder="Ex.: Renegociar seguro auto" maxLength={200}/></label>
          {value('reminderText').trim()&&<label>Dias de antecedência<input type="number" min={0} max={365} step={1} value={value('reminderDays')} onChange={e=>set('reminderDays',e.target.value)} required aria-invalid={invalidField('REMINDER')} aria-describedby={invalidField('REMINDER')?'form-error':undefined}/>{fieldError('REMINDER')}</label>}
        </div>
        <p className="preview">O montante em branco fica por indicar. Se escolher uma poupança, a conta é preenchida automaticamente.</p>
      </>}
      {modal.kind==='reserve'&&<><label>Nome da poupança<input autoFocus value={value('name')} onChange={e=>set('name',e.target.value)} aria-invalid={invalidField('NAME')} aria-describedby={invalidField('NAME')?'form-error':undefined} required/>{fieldError('NAME')}</label>{accountField}<p className="preview">Depois pode indicar o total acumulado e definir quanto quer poupar neste mês.</p></>}
      {['account','category'].includes(modal.kind)&&<><label>Nome<input autoFocus value={value('name')} onChange={e=>set('name',e.target.value)} aria-invalid={invalidField('NAME')} aria-describedby={invalidField('NAME')?'form-error':undefined} required/>{fieldError('NAME')}</label>{modal.kind==='account'&&<><label>Cor de identificação<input type="color" value={value('color')} onChange={e=>set('color',e.target.value)}/></label></>}</>}
      {error&&!fieldCode&&<div id="form-error" role="alert" className="form-error"><p>{error}</p>

      </div>}
    </div><div className="dialog-footer"><button type="button" className="button" onClick={close}>{modal.optionalGoal?'Agora não':'Cancelar'}</button><button className={`button ${modal.kind==='deleteAccount'?'danger':'primary'}`} type="submit" disabled={conflict||modal.kind==='link'&&!linkTarget}>{modal.kind==='deleteAccount'?'Eliminar definitivamente':modal.kind==='month'?'Abrir mês':missingBalances.length?'Confirmar saldos e registo':modal.kind==='payment'?'Confirmar registo':'Confirmar'}</button></div></fieldset></form>}</Dialog>}
  </div>;

  function history(source?:string,lineId?:string){
    const events=m.events.filter(e=>lineId?e.lineId===lineId:source&&(e.deltas[source]!=null||
      e.type==='saving'&&e.complete&&e.line?.reserveId&&source===rid(e.line.reserveId)||
      !!e.savingParentId&&m.events.some(parent=>parent.id===e.savingParentId&&parent.deltas[source]>0)));
    if(!events.length)return <p className="empty-history">Ainda sem registos neste mês.</p>;
    return <div className="history">{events.map(e=>{
      const expenseLine=source?.startsWith('a:')&&e.lineId
        ?e.line??m.lines.find(l=>l.id===e.lineId)??m.removedLines?.find(l=>l.id===e.lineId)
        :undefined;
      const expense=expenseLine?.kind==='expense'?expenseLine:undefined;
      const category=expense&&s.categories.find(c=>c.id===expense.categoryId)?.name;
      return <div className={e.voided?'voided':''} key={e.id}
        tabIndex={modal?.eventId===e.id?-1:undefined} data-initial-focus={modal?.eventId===e.id?true:undefined}>
        <div><strong>{e.description||expense?.name||e.note}</strong>
          {expense&&e.description&&e.description!==expense.name&&<small>{expense.name}</small>}
          {category&&<small>{category}</small>}
          {(expense?e.type==='total'||e.type==='detail':e.description)&&<small>{e.note}</small>}
          <small>{dateLabel(e.date)}{e.voided?' · Anulado':''}{lineId&&e.type==='total'?' · ajuste, sem nova compra':e.type==='detail'?' · já incluída, sem novo gasto':''}</small>
          {e.saving&&<small>{money(e.amount)} para o objetivo · {money(e.saving.extra)} de reforço extra{e.saving.transferId?' · Com transferência própria associada':''}</small>}
          {e.savingParentId&&<small>{money(e.amount)} associados · Sem alteração aos saldos</small>}
          {Object.keys(e.deltas).length>0&&<small>{Object.entries(e.deltas).map(([key,delta])=>`${key.startsWith('r:')?sourceName(key):(e.sourceNames?.[key]??sourceName(key))}: ${delta>0?'+':''}${money(delta)}`).join(' · ')}</small>}
          <span>{money(lineId?e.purchaseAmount??e.amount:source?e.deltas[source]??e.amount:e.amount)}</span>
        </div>
        {!e.voided&&<button className="text-button danger" disabled={busy||uncertain||conflict} onClick={()=>safe({type:'void',id:e.id},
          e.saving?.transferId||activeEvents(m).some(x=>x.saving?.transferId===e.id)?'Transferência e reforço anulados. Os saldos foram atualizados.':'Registo anulado. Os valores foram atualizados.')}>Anular</button>}
      </div>;
    })}</div>;
  }
}

