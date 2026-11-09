'use client';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useDemoStore } from '@/data/useDemoStore';
import { usePersistentStore } from '@/data/usePersistentStore';
import { newRequestId } from '@/data/requestId';
import type { Month, State } from '@/domain/model';
import { DomainError, accumulatedTotal, activeEvents, balance, canDeleteAccount, completed, effects, freeSaving, previousSavingBalance, savingGoals, savingProgress, totalUnallocated, initialPlan, linkableExpenses, obligations, pending, plannedSource, planTotal, realized, summary, type Action } from '@/domain/engine';
import { aid, rid, type Account, type Line, type Kind, type Recurring, type Reserve } from '@/domain/model';
import { calendarDate, dateLabel, inputMoney, money, monthLabel, parseMoney } from '@/domain/money';
import { Choice, Dialog } from './Dialog';
import { Icon } from './Icon';
import { InitialBalances } from './InitialBalances';
import { BudgetRemainders } from './BudgetRemainders';
import { AccountFunding } from './AccountFunding';
import { RecurringPayments } from './RecurringPayments';
import { LocalFiles } from './LocalFiles';
import { TrialChecks } from './TrialChecks';
import { validPeriod, validDate, validName, daysInMonth, sum } from '@/domain/validation';
import { knownBankAvailability, reserveFunding } from '@/domain/funding';
import { advanceReminders } from '@/domain/reminders';
import type { Confirmed } from '@/server/repository';

type Screen='month'|'plan'|'accounts'|'savings'|'recurring'|'base'|'settings';
type Modal={kind:string;id?:string;target?:'base';source?:string;reserveId?:string;otherBank?:boolean;requestId:string;revision?:number;returnTo?:string;eventId?:string};
const navigation:{id:Screen;label:string;icon:string}[]=[{id:'month',label:'Mês',icon:'month'},{id:'plan',label:'Plano e movimentos',icon:'base'},{id:'accounts',label:'Contas',icon:'accounts'},{id:'savings',label:'Poupanças',icon:'savings'},{id:'recurring',label:'Pagamentos recorrentes',icon:'recurring'},{id:'base',label:'Modelo Base',icon:'base'},{id:'settings',label:'Definições',icon:'settings'}];
const kindLabel:Record<Kind,string>={expense:'Despesas',income:'Receitas',saving:'Reforços de poupança',investment:'Investimentos'};
const monthKindLabel:Record<Kind,string>={expense:'Despesas',income:'Recebimentos extra',saving:'Poupanças',investment:'Investimentos'};
const monthKindTotal:Record<Kind,string>={expense:'Total de despesas',income:'Total de recebimentos extra',saving:'Total de poupanças',investment:'Total de investimentos'};
const baseKinds:Kind[]=['income','expense','saving'];
const createLabel:Record<Kind,string>={expense:'Registar nova despesa',income:'Adicionar novo recebimento extra',saving:'Adicionar poupança ao mês',investment:'Adicionar investimento'};
const isLongAmount=(amount:number|null)=>amount!==null&&money(amount).length>13;
const totalEffect=(adjustment:number)=>adjustment===0?'Sem alteração ao saldo':adjustment>0
  ?`Débito adicional de ${money(adjustment)}`:`Crédito de ${money(-adjustment)}`;
type PaymentReceipt={period:string;lineId:string;eventId:string};
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
type Store={state:State;revision?:number;getRevision?:()=>number|undefined;dispatch:(action:Action,id?:string,revision?:number)=>void|Promise<void>;reset:()=>void;busy?:boolean;uncertain?:boolean;retry?:()=>Promise<void>;error?:string;refresh?:()=>Promise<Confirmed|false>};
export function App({demo=false,recoveryScope,trial=false,home=false}:{demo?:boolean;recoveryScope?:string;trial?:boolean;home?:boolean}){
  return demo?<DemoApp/>:<LocalApp recoveryScope={recoveryScope} trial={trial} home={home}/>;
}
function DemoApp(){const store=useDemoStore();return <Workspace store={store} demo/>;}
function LocalApp({recoveryScope,trial,home}:{recoveryScope?:string;trial:boolean;home:boolean}){
  const store=usePersistentStore(recoveryScope,home);
  const period=calendarDate().slice(0,7);
  const [viewExisting,setViewExisting]=useState(false);
  const [error,setError]=useState('');
  if(store.signedOut)return <div className="app-shell storage-opening"><h1>Sessão terminada</h1><p>Volte a entrar para continuar. Se tinha uma gravação por confirmar, pode retomá-la depois de entrar.</p><a href="/entrar">Voltar a entrar</a></div>;
  if(!store.state)return <div className="app-shell storage-opening" data-ready="false"><h1>O meu mês</h1><p role="status">{store.error?'Dados locais indisponíveis.':'A abrir os dados locais…'}</p>{store.error&&<><p role="alert" className="form-error">{store.error}</p><button className="button" onClick={()=>void store.refresh()}>Tentar novamente</button></>}</div>;
  if(home&&!store.state.months[period]&&!viewExisting&&!store.uncertain)return <main className="storage-opening">
    {trial&&<p>Ensaio — dados fictícios guardados</p>}<h1>{monthLabel(period)}</h1>
    <p>O mês atual ainda não foi aberto. O Modelo Base prepara o plano, com saldos por indicar e sem execução.</p>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <button className="button primary" disabled={store.busy} onClick={async()=>{try{await store.dispatch({type:'month',period});}catch(e){setError((e as Error).message);}}}>Abrir mês atual</button>
    <button className="button" disabled={store.busy} onClick={()=>setViewExisting(true)}>Consultar meses guardados</button>
    <form action="/sair" method="post"><button className="text-button">Terminar sessão</button></form>
  </main>;
  return <Workspace store={{...store,state:store.state}} demo={false} recovery={!!recoveryScope} trial={trial} home={home}/>;
}
function Workspace({store,demo,recovery=false,trial=false,home=false}:{store:Store;demo:boolean;recovery?:boolean;trial?:boolean;home?:boolean}){
  const {state:s,dispatch,reset,busy=false,uncertain=false}=store;
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  const [screen,setScreen]=useState<Screen>('month'),[tab,setTab]=useState<Kind>('expense');
  const [expandedMetric,setExpandedMetric]=useState<'balance'|'expenses'|'savings'|null>(null);
  const [pendingOnly,setPendingOnly]=useState(false);
  const [modal,setModal]=useState<Modal|null>(null),[values,setValues]=useState<Record<string,string>>({}),[error,setError]=useState(''),[initialErrorSource,setInitialErrorSource]=useState(''),[globalError,setGlobalError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState('');
  const [errorCode,setErrorCode]=useState('');
  const [errorAttempt,setErrorAttempt]=useState(0);
  const [catalogSearch,setCatalogSearch]=useState({account:'',category:''});
  const [receipt,setReceipt]=useState<(PaymentReceipt&{expiresAt:number})|null>(null);
  const pendingReceipt=useRef<PaymentReceipt|null>(null);
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
  const m=s.months[s.selected],totals=summary(s,m);
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
  const forecast=knownBankAvailability(s,m,false);
  const savingCommitments=screen==='month'?m.lines.filter(l=>(l.kind==='saving'||l.kind==='investment')&&pending(m,l)!==0):[];
  const reserveWarnings=screen==='month'||screen==='savings'?reserveFunding(s,m):[];
  const reserveWarningText=({current,required,missing}:typeof reserveWarnings[number])=>missing!==null
    ?`Faltam ${money(missing)} para cobrir as despesas previstas.`
    :`Por apurar. ${current===null?'Saldo inicial por indicar. ':''}${required===null?'Valor por indicar no plano.':''}`;
  const upcomingReminders=screen==='month'?advanceReminders(s.recurring,m.period,calendarDate()):[];
  const monthKinds:Kind[]=['expense','income','saving'];
  if(hasInvestment||tab==='investment')monthKinds.push('investment');
  const modelKinds=s.base.some(l=>l.kind==='investment')?[...baseKinds,'investment' as const]:baseKinds;
  const [fundingOpen,setFundingOpen]=useState(false);
  const shortages=monthAccounts.flatMap(({account,forecast})=>forecast!==null&&forecast<0?[{name:account.name,amount:-forecast}]:[]);
  const selectedLine=modal?.id&&['line','detail','payment'].includes(modal.kind)?(modal.target==='base'?s.base:m.lines).find(l=>l.id===modal.id):undefined;
  const nameOf=(id:string)=>s.accounts.find(a=>a.id===id)?.name??'Conta por indicar';
  const reserveLabel=(r:Reserve)=>{
    const duplicates=s.reserves.filter(x=>x.accountId===r.accountId&&x.name===r.name);
    if(duplicates.length<2)return r.name;
    // Catalog insertion order is preserved in SQLite. The selection itself always uses the ID.
    return `${r.name} · Reserva ${duplicates.findIndex(x=>x.id===r.id)+1} de ${duplicates.length}`;
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
    return `${demo?'Simulação confirmada':'Gravação confirmada'} · ${result} · ${dateLabel(event.date)} · ${sourceName(source)}`;
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
  const openGoals=goals.filter(l=>(pending(m,l)??0)>0);
  const goalForSaving=openGoals.find(l=>l.id===value('goalId'));
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
    :modal?.kind==='save'?[value('source'),savingBank,savingSource]
    :immediate?[effectiveSource]:[];
  const missingBalances=[...new Set(operationSources)].filter(id=>!!id&&m.initials[id]==null).map(id=>({
    id,name:sourceName(id),suggestion:id.startsWith('r:')?previousSavingBalance(s,m,id.slice(2)):null
  }));
  function collectInitials(){
    return Object.fromEntries(missingBalances.map(source=>{
      try{return [source.id,parseMoney(value(`initial:${source.id}`))];}
      catch{setInitialErrorSource(source.id);throw new DomainError('INITIAL_VALUE',`Indique um saldo inicial válido para ${source.name}. Se começou vazio, indique 0,00 €.`);}
    }));
  }
  const dateDefault=()=>calendarDate().startsWith(s.selected)?calendarDate():`${s.selected}-01`;
  const notify=(text:string)=>{setNotice(text);setGlobalError('');};
  async function run(action:Action,text:string,requestId?:string,revision?:number){await dispatch(action,requestId,revision);notify(demo?text:text.replaceAll('Simulação atualizada.','Gravação local confirmada.').replaceAll('Simulação atualizada em memória. Os valores já refletem a ação.','Gravação local confirmada. Os valores já refletem a ação.').replaceAll('nesta simulação','localmente').replaceAll('da simulação','do registo'));}
  function open(kind:string,options:Partial<Omit<Modal,'kind'|'requestId'|'revision'>>&{kind?:Kind}={}){
    if(busy||uncertain||conflict)return;
    const l=options.id?(options.target==='base'?s.base:m.lines).find(x=>x.id===options.id):undefined;
    let v:Record<string,string>={date:dateDefault(),amount:'',name:'',account:accounts[0]?.id??'',category:'',kind:options.kind??tab,source:sources[0]?.id??'',destination:sources[1]?.id??'',complete:'false',mode:'purchase',period:s.selected,reserve:''};
    if(kind==='month'){
      const [year,month]=s.selected.split('-').map(Number);
      if(month<12)v.period=s.selected.slice(0,5)+String(month+1).padStart(2,'0');
      else if(year<9999)v.period=String(year+1).padStart(4,'0')+'-01';
    }
    if(l)v={...v,name:l.name,amount:kind==='payment'&&l.variable?'':inputMoney(kind==='payment'?pending(m,l):l.plan),account:l.accountId,category:l.categoryId,kind:l.kind,source:l.kind==='expense'&&l.reserveId?rid(l.reserveId):l.accountId?aid(l.accountId):'',reserve:l.reserveId??'',variable:l.variable?'true':'false'};
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
        v={...v,reserve:reserve.id,goalId:goal?.id??'',source:aid(reserve.accountId),
          amount:inputMoney(kind==='goal'?goal?.plan:kind==='save'&&goal?pending(m,goal):null),
          savingMode:goal?'goal':'extra'};
      }
    }
    if(kind==='recurring')v.kind='expense';
    if(kind==='recurring'&&options.id){const r=s.recurring.find(r=>r.id===options.id)!;v={...v,...r,amount:inputMoney(r.amount),account:r.accountId,reserve:r.reserveId??'',active:r.active?'true':'false',reminderDays:String(r.reminderDays??30)};}
    if(kind==='recurring'&&!options.id)v={...v,date:calendarDate(),account:'',frequency:'monthly',active:'true',reminderDays:'30'};
    if(kind==='account'&&options.id){const a=s.accounts.find(a=>a.id===options.id)!;v={...v,name:a.name,restricted:a.restricted?'true':'false',color:a.color};}
    if(kind==='category'&&options.id)v.name=s.categories.find(c=>c.id===options.id)!.name;
    setValues(v);setError('');setErrorCode('');setInitialErrorSource('');setModal({...options,kind,requestId:newRequestId(),revision:store.revision});
  }
  function close(){if(busy)return;setModal(null);setError('');setErrorCode('');setInitialErrorSource('');}
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
        confirmation?'':`${l.name}: ${money(amount)} ${l.kind==='income'?'recebidos':l.kind==='saving'?'reservados':'investidos'}. Simulação atualizada.`,
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
    const id=modal.id??modal.requestId;
    const form=new FormData(e.currentTarget as HTMLFormElement);
    let action:Action|undefined;
    let feedback='Simulação atualizada em memória. Os valores já refletem a ação.';
    switch(modal.kind){
      case 'month':{
        const period=value('period');
        validPeriod(period);
        action={type:'month',period};
        feedback='Mês criado a partir do Modelo Base. Saldos iniciais por indicar.';
        if(s.months[period])feedback=demo?'Mês de exemplo reaberto.':'Mês reaberto com os dados guardados.';
        break;
      }
      case 'initial':action={type:'initial',source:modal.source!,amount:amount()};break;
      case 'reconcile':action={type:'reconcile',source:modal.source!,amount:amount(),date:value('date'),note:value('note')};break;
      case 'payment':{
        const mode=value('mode'),description=value('description').trim();
        const cents=amount();
        validDate(value('date'),m.period);
        if(mode==='detail'&&!value('totalId'))throw new DomainError('DETAIL','Escolha o ajuste que já inclui esta compra.');
        action={type:'execute',lineId:modal.id!,amount:cents,date:value('date'),source:sourceId(),complete:mode!=='detail'&&value('complete')==='true',total:mode==='total',description,initials:collectInitials(),includedInTotal:mode==='detail'?value('totalId'):undefined};
        if(mode==='detail')feedback='Compra identificada no total existente. O gasto e o saldo mantêm-se.';
        else if(selectedLine?.kind==='expense'&&mode!=='total'&&description)feedback=`Compra «${description}» de ${money(cents)} registada em ${selectedLine.name}. Simulação atualizada.`;
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
          execution={amount:actual,date:value('date'),source:effectiveSource,initials:collectInitials(),description:variable?value('description').trim():undefined};
        }
        action={type:'line',target:modal.target,line:{id,name,kind,plan:cents,accountId:account,categoryId:category,reserveId:kind==='saving'||kind==='expense'?reserve||undefined:undefined,variable},execution};
        if(modal.target==='base')feedback=demo?'Modelo Base atualizado na demonstração.':'Modelo Base guardado para os meses ainda por criar.';
        else if(execution&&kind==='income')feedback=`${name} · ${money(execution.amount)} recebidos em ${dateLabel(execution.date)} · ${sourceName(execution.source)}. Simulação atualizada.`;
        break;
      }
      case 'goal':{
        if(!reserveForm)throw new DomainError('RESERVE','Escolha a poupança.');
        const goal=goals.find(l=>l.id===value('goalId'));
        if(goals.length&&!goal)throw new DomainError('GOAL','Escolha o compromisso que pretende editar.');
        action={type:'line',line:goal?{...goal,plan:amount()}:{id,name:reserveForm.name,kind:'saving',plan:amount(),accountId:reserveForm.accountId,categoryId:'',reserveId:reserveForm.id}};
        feedback=`Objetivo do mês de ${money(action.line.plan)} para ${reserveForm.name}. Simulação atualizada.`;
        break;
      }
      case 'save':{
        if(!reserveForm)throw new DomainError('RESERVE','Escolha a poupança.');
        if(value('savingMode')==='goal'&&!goalForSaving)throw new DomainError('GOAL','Escolha um objetivo com montante por poupar.');
        const cents=amount();
        action={type:'save',reserveId:reserveForm.id,lineId:value('savingMode')==='goal'?goalForSaving?.id:undefined,
          amount:cents,date:value('date'),source:sourceId(),initials:collectInitials()};
        feedback=`${money(cents)} para ${reserveForm.name}. Simulação atualizada.`;
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
        feedback=demo?'Definição atualizada na demonstração.':'Definição do pagamento recorrente guardada.';
        break;
      }
      case 'account':{validName(value('name'));if(s.accounts.some(a=>a.id!==id&&a.name===value('name').trim()))throw new DomainError('NAME','Já existe uma conta com esse nome.');action={type:'account',account:{...s.accounts.find(a=>a.id===id),id,name:value('name').trim(),color:value('color')||'#7a9c8c',restricted:value('restricted')==='true'}};break;}
      case 'deleteAccount':action={type:'deleteAccount',id};feedback='Conta eliminada.';break;
      case 'reserve':action={type:'reserve',reserve:{id,name:value('name').trim(),accountId:accountId()}};break;
      case 'category':{validName(value('name'));if(s.categories.some(c=>c.id!==id&&c.name===value('name').trim()))throw new DomainError('NAME','Já existe uma categoria com esse nome.');action={type:'category',category:{...s.categories.find(c=>c.id===id),id,name:value('name').trim()}};break;}
      case 'reset':reset();notify('Exemplos repostos. Todas as alterações da simulação foram removidas.');close();return;
    }
    if(action){
      const executionLine=action.type==='line'&&action.line.kind==='expense'&&action.execution?action.line.id:null;
      const confirmation=executionLine?{period:m.period,lineId:executionLine,eventId:modal.requestId}:action.type==='execute'&&selectedLine?.kind==='expense'&&!action.includedInTotal&&
        (!action.total||action.complete||action.amount!==realized(m,action.lineId))
        ?{period:m.period,lineId:action.lineId,eventId:modal.requestId}:null;
      pendingReceipt.current=confirmation;
      await run(action,confirmation?'':feedback,modal.requestId,modal.revision);
      if(confirmation)showReceipt(confirmation);
      pendingReceipt.current=null;
      if(action.type==='reserve'){
        setValues(v=>({...v,reserve:action.reserve.id,goalId:'',amount:''}));
        setModal({kind:'goal',reserveId:action.reserve.id,requestId:newRequestId(),revision:store.getRevision?.()});
        return;
      }
      if(action.type==='deleteAccount')requestAnimationFrame(()=>document.getElementById('bank-accounts-title')?.focus());
    }
    if(modal.kind==='month'&&screen==='base'){setScreen('month');setTab('expense');window.scrollTo({top:0});}
    close();
  }catch(e){if(e instanceof DomainError)pendingReceipt.current=null;formFailure(e);}}
  function formFailure(e:unknown){
    if(reportConflict(e))return;
    setError((e as Error).message);
    setErrorAttempt(n=>n+1);
    setErrorCode(e instanceof DomainError?e.code:'');
  }
  async function safe(action:Action,text:string){if(conflict)return;try{await run(action,text,undefined,modal?.revision??store.revision);}catch(e){if(reportConflict(e))return;if(modal){formFailure(e);}else setGlobalError((e as Error).message);}}
  async function retryPending(){try{
    await store.retry?.();setModal(null);setError('');
    if(pendingReceipt.current){showReceipt(pendingReceipt.current);pendingReceipt.current=null;notify('');}
    else notify('Gravação local confirmada sem duplicar efeitos.');
  }catch(e){if(!reportConflict(e)){setError((e as Error).message);setGlobalError((e as Error).message);}}}
  function navigate(next:Screen,target?:string){
    setFundingOpen(false);setExpandedMetric(null);setPendingOnly(false);setScreen(next);setSearch('');setCatalogSearch({account:'',category:''});setNotice('');
    if(!conflict)setGlobalError('');
    window.scrollTo({top:0});
    if(target)requestAnimationFrame(()=>{
      const element=document.getElementById(target);
      element?.focus({preventScroll:true});
      element?.scrollIntoView({block:'start'});
    });
  }
  function showPendingPlan(kind:Kind){
    navigate('plan',`tab-${kind}`);
    setTab(kind);setPendingOnly(true);
  }
  function toggleAccount(account:Account){
    return safe({type:'account',account:{...account,archived:!account.archived}},
      account.archived?'Conta reativada.':'Conta desativada. Os registos guardados continuam disponíveis.');
  }
  const accountBadge=(id:string)=><span className="account-badge"><i style={{background:s.accounts.find(a=>a.id===id)?.color??'#aaa'}}/>{nameOf(id)}</span>;
  const status=(l:Line)=>completed(m,l.id)?(l.kind==='expense'?'Concluída':'Concluído'):
    l.plan!=null&&realized(m,l.id)>l.plan?'Excesso':realized(m,l.id)>0&&pending(m,l)!==0?'Parcial':l.plan==null?'Valor por indicar':l.plan===0?'Previsto a zero':pending(m,l)===0?(l.kind==='saving'?'Objetivo atingido':l.variable?'Orçamento atingido':'Valor previsto atingido'):'Por realizar';
  const matches=(text:string,filter:string)=>text.toLocaleLowerCase('pt-PT').includes(filter.trim().toLocaleLowerCase('pt-PT'));
  const tabLines=m.lines.filter(l=>l.kind===tab);
  const plannedCount=tabLines.filter(l=>l.plan!==null).length;
  const visibleLines=pendingOnly?tabLines.filter(l=>pending(m,l)!==0):tabLines;
  const filtered=visibleLines.filter(l=>matches(l.name,search));
  const principal=s.accounts.filter(a=>!a.restricted).map(a=>aid(a.id));
  const reserves=s.reserves.map(r=>rid(r.id));
  const catalogTotals=[
    {label:'Contas à ordem',keys:principal,unit:'contas',tone:'principal',icon:'accounts'},
    {label:'Poupanças',keys:reserves,unit:'poupanças',tone:'savings',icon:'savings'},
    {label:'Total em contas e poupanças',keys:[...principal,...reserves],unit:'saldos conhecidos',tone:'total',icon:'base'},
  ];
  const noResults=(clear:()=>void)=><div className="empty"><h3>Sem resultados para esta pesquisa</h3><button className="text-button" onClick={clear}>Limpar pesquisa</button></div>;
  const showReserve=(id:string)=>navigate('savings',`reserve-${id}`);

  function lineList(lines:Line[],baseKind?:Kind){return <div className="line-list">
    {!baseKind&&lines.some(l=>l.kind!=='saving')&&<div className="list-columns"><span>Movimento / conta</span><span>Plano atual</span><span>Realizado</span><span>Falta</span><span>Ações</span></div>}
    {lines.length===0&&(!baseKind&&screen==='month'&&search.trim()&&m.lines.some(l=>l.kind===tab)?noResults(()=>setSearch('')):<div className="empty"><h3>{baseKind?'Sem definições deste tipo':'Ainda sem movimentos'}</h3><p>{baseKind?'Adicione uma definição para incluir nos novos meses.':'Adicione uma linha ao plano deste mês.'}</p>{baseKind&&<button className="button small" disabled={busy||uncertain||conflict} onClick={()=>open('line',{target:'base',kind:baseKind})}>{({income:'Adicionar receita',expense:'Adicionar despesa',saving:'Adicionar reforço',investment:'Adicionar investimento'})[baseKind]}</button>}</div>)}
    {lines.map(l=>{
      const recent=!baseKind&&receipt?.period===m.period&&receipt.lineId===l.id?receipt.eventId:undefined;
       const payment=recent?recentPayment:undefined;
       const saving=l.kind==='saving'&&!baseKind;
       const excess=!baseKind&&l.plan!==null?Math.max(0,realized(m,l.id)-l.plan):0;
      const wideAmounts=!baseKind&&[l.plan,realized(m,l.id),pending(m,l)].some(isLongAmount);
       return <article className={`movement${baseKind?' base-row':''}${saving?' saving-row':''}${wideAmounts?' wide-amounts':''}`} key={l.id} data-testid={`line-${l.id}`}>
       <div className="movement-name"><button className="name-button" disabled={busy||uncertain||conflict} onClick={()=>open(baseKind?'line':'detail',{id:l.id,target:baseKind?'base':undefined})}>{l.name}</button><div>{accountBadge(l.accountId)}{l.reserveId&&l.kind==='expense'&&<span className="tiny"> · {sourceName(rid(l.reserveId))}</span>}</div>{!baseKind&&<span className={`status ${completed(m,l.id)?'done':realized(m,l.id)>0?'partial':''}`}>{status(l)}{excess>0&&status(l)!=='Excesso'?` · Excesso de ${money(excess)}`:excess>0?` de ${money(excess)}`:''}{m.snapshot&& !m.snapshot.lines.some(x=>x.id===l.id)?' · Adicionado depois do plano inicial':m.snapshot&&initialPlan(m,l)!==l.plan?' · Plano alterado':''}</span>}</div>
       <div className="amount"><small>{baseKind?'Previsto':saving?'Objetivo do mês':'Plano atual'}</small>{money(l.plan)}</div>
       {!baseKind&&<><div className="amount realized"><small>{saving?'Já poupado para o objetivo':'Realizado'}</small>{money(realized(m,l.id))}</div><div className="amount"><small>{saving?'Falta poupar':'Falta'}</small>{money(pending(m,l))}</div></>}
       <div className="line-actions">{baseKind?<button className="button small" disabled={busy||uncertain||conflict} onClick={()=>open('line',{id:l.id,target:'base'})}>Editar</button>:<>
         {(saving||!completed(m,l.id))&&<button id={`pay-${l.id}`} data-pay className="button small primary-soft" disabled={busy||uncertain||conflict} onClick={()=>saving?open('save',{id:l.id,reserveId:l.reserveId}):l.variable?open('payment',{id:l.id}):full(l)}>{l.variable?'Registar':l.kind==='income'?'Receber':saving?'Poupar':l.kind==='investment'?'Investir':'Pagar'}</button>}
         <button id={`detail-${l.id}`} className="icon-button detail-action" aria-label={`Detalhe de ${l.name}`} disabled={busy||uncertain||conflict} onClick={()=>open('detail',{id:l.id})}><span>Detalhe</span><Icon name="arrow" size={17}/></button>
       </>}</div>
       {payment&&receipt&&<PaymentFeedback key={payment.id} lineId={l.id} text={receiptText(payment)} expiresAt={receipt.expiresAt} onView={()=>open('detail',{id:l.id,eventId:payment.id,returnTo:`detail-${l.id}`})}/>}
    </article>;})}
  </div>;}

  const fieldCodes=['NAME','AMOUNT','ACTUAL','MONEY_LIMIT','ACCOUNT','CATEGORY','RESERVE','DATE','PERIOD','REMINDER','NOTE','DETAIL','TOTAL_BELOW_PURCHASES','SOURCE','TOTAL_SOURCE','FUNDS','RESTRICTED','DESTINATION','INITIAL_VALUE','GOAL','SAVING_EVENT'];
  const fieldCode=modal?.kind!=='detail'&&(fieldCodes.includes(errorCode)||immediate&&errorCode==='INITIAL')&&
    (modal?.kind!=='save'||errorCode!=='DESTINATION')&&
    (modal?.kind!=='reconcile'||!['SOURCE','FUNDS'].includes(errorCode))?errorCode:'';
  const invalidField=(...codes:string[])=>!!fieldCode&&codes.includes(fieldCode);
  const fieldError=(...codes:string[])=>invalidField(...codes)&&<span id="form-error" role="alert" className="inline-error">{error}</span>;
  const setPlanAccount=(id:string)=>{
    const reserve=s.reserves.find(r=>r.id===value('reserve'));
    if(reserve&&id!==reserve.accountId)set('reserve','');
    set('account',id);
  };
  const reserveCodes=immediate&&value('reserve')?['RESERVE','FUNDS','SOURCE','RESTRICTED','INITIAL']:['RESERVE'];
  const reserveOptions=s.reserves.filter(r=>modal?.kind==='line'&&value('kind')==='expense'
    ?r.accountId===value('account')
    :accounts.some(a=>a.id===r.accountId&&!a.restricted)||r.id===value('reserve'));
  const reserveSelect=<label>{value('kind')==='saving'?'Poupança de destino':'Poupança usada para pagar (opcional)'}<select value={value('reserve')} aria-invalid={invalidField(...reserveCodes)} aria-describedby={invalidField(...reserveCodes)?'form-error':undefined} onChange={e=>{
    const reserve=s.reserves.find(r=>r.id===e.target.value);
    set('reserve',e.target.value);
    if(reserve)set('account',reserve.accountId);
  }} required={value('kind')==='saving'}><option value="">Sem poupança</option>{reserveOptions.map(r=><option value={r.id} key={r.id}>{reserveLabel(r)} · {nameOf(r.accountId)}</option>)}</select>{fieldError(...reserveCodes)}</label>;
  const focusAmount=(modal?.kind==='payment'&&missingBalances.length===0)||modal?.kind==='initial'||modal?.kind==='reconcile'||modal?.kind==='goal'&&!!reserveForm;
  const amountField=(label='Montante (€)',required=true,hint?:string)=><label>{label}<input autoFocus={focusAmount} data-initial-focus={focusAmount||undefined} name="amount" aria-label={label} inputMode="decimal" value={value('amount')} onChange={e=>set('amount',e.target.value)} placeholder={required?'0,00':'Por indicar'} required={required} aria-invalid={invalidField('AMOUNT','MONEY_LIMIT','TOTAL_BELOW_PURCHASES')} aria-describedby={invalidField('AMOUNT','MONEY_LIMIT','TOTAL_BELOW_PURCHASES')?'form-error':hint?'amount-hint':undefined}/>{hint&&<small id="amount-hint">{hint}</small>}{fieldError('AMOUNT','MONEY_LIMIT','TOTAL_BELOW_PURCHASES')}{!error&&totalPreviewError?.code==='TOTAL_BELOW_PURCHASES'&&<span className="inline-error">{totalPreviewError.message}</span>}</label>;
  const dateField=<label>{modal?.kind==='recurring'?'Data de referência':'Data'}<input name="date" aria-label={modal?.kind==='recurring'?'Data de referência':'Data'} type="date" value={value('date')} min={modal?.kind==='recurring'?undefined:`${s.selected}-01`} max={modal?.kind==='recurring'?undefined:`${s.selected}-${daysInMonth(Number(s.selected.slice(0,4)),Number(s.selected.slice(5)))}`} aria-invalid={invalidField('DATE')} aria-describedby={invalidField('DATE')?'form-error':undefined} onChange={e=>set('date',e.target.value)} required/>{fieldError('DATE')}</label>;
  const sourceField=(label='Origem',field='source',options=sources)=>{
    const codes=field==='destination'?['DESTINATION']:['SOURCE','TOTAL_SOURCE','FUNDS','RESTRICTED'];
    return <Choice label={label} name={field} options={options} value={value(field)} onChange={v=>set(field,v)} required invalid={invalidField(...codes)} error={fieldError(...codes)}/>;
  };
  const accountCodes=immediate&&!value('reserve')?['ACCOUNT','FUNDS','SOURCE','RESTRICTED','INITIAL']:['ACCOUNT'];
  const accountLabel=modal?.kind==='recurring'?'Conta (opcional)':modal?.kind==='reserve'?'Banco onde está a poupança':
    modal?.kind==='line'?value('kind')==='income'?'Banco onde recebe o dinheiro':'Banco de onde sai o dinheiro':'Conta';
  const accountField=<Choice label={accountLabel} name="account" options={s.accounts.filter(a=>!a.archived||a.id===value('account'))} value={value('account')} onChange={setPlanAccount} required={modal?.kind!=='recurring'} invalid={invalidField(...accountCodes)} error={fieldError(...accountCodes)}/>;
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
  const enteredAmount=(()=>{try{return parseMoney(value('amount'));}catch{return null;}})();
  const bankAvailable=value('source')?balance(m,value('source')):null;
  const observedBalance=modal?.source?balance(m,modal.source):null;
  const savingAmount=value('savingMode')==='goal'&&goalForSaving?Math.min(enteredAmount??0,pending(m,goalForSaving)??0):0;
  const extraAmount=enteredAmount===null?null:enteredAmount-savingAmount;
  const separateBank=!!value('source')&&value('source')!==savingBank;
  const selectableBanks=accounts.filter(a=>!a.restricted).map(a=>({id:aid(a.id),name:a.name}));
  const expensePaymentSources=modal?.otherBank?selectableBanks.filter(a=>a.id!==aid(selectedLine?.accountId??'')):
    selectedLine?.kind==='expense'?sources:sources.filter(a=>a.id.startsWith('a:'));
  const goalOptionLabel=(line:Line,index:number)=>`Compromisso ${index+1} · ${line.name} · ${money(line.plan)} · faltam ${money(pending(m,line))}`;
  const goalSelect=(options:Line[],onChange:(id:string)=>void)=><label>Compromisso do mês<select value={value('goalId')}
    onChange={e=>onChange(e.target.value)} aria-invalid={invalidField('GOAL')} aria-describedby={invalidField('GOAL')?'form-error':undefined}>
    <option value="">Escolha o compromisso</option>{options.map((l,index)=><option key={l.id} value={l.id}>{goalOptionLabel(l,index)}</option>)}
  </select>{fieldError('GOAL')}</label>;
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
    category:modal?.id?'Editar categoria':'Adicionar categoria',reserve:'Criar poupança',reset:'Repor dados de exemplo'
  };

  const nav=(mobile=false)=><nav aria-label="Navegação principal">{navigation.map(n=><button key={n.id} aria-label={n.label} className={screen===n.id?'active':''} onClick={()=>{navigate(n.id);if(mobile)closeMenu();}} aria-current={screen===n.id?'page':undefined}><Icon name={n.icon}/><span>{n.label}</span>{n.id==='recurring'&&<em>{m.occurrences.filter(o=>o.state==='open').length}</em>}</button>)}</nav>;
  const signOut=<form action="/sair" method="post"><button className="text-button">Terminar sessão</button></form>;
  return <div className="app-shell" data-ready={ready} aria-busy={busy}>
    <a className="skip-link" href="#main">Saltar para o conteúdo</a>
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Icon name="leaf" size={24}/></span><div>O meu mês<small>UM PLANO, MAIS CLAREZA.</small></div></div><div className="nav-caption">O SEU ESPAÇO</div>{nav()}<div className="sidebar-bottom"><span className="local-dot"/> {home?'Acesso em casa':'Neste computador'}<p>{demo?'Demonstração':home?'PC de casa':'Aplicação local'}</p>{demo?<><button disabled={busy||uncertain||conflict} onClick={()=>open('reset')}>Repor exemplos <span>↻</span></button><a href="/">Abrir dados locais</a></>:home?signOut:null}</div></aside>
    <div className="workspace"><div className="demo-banner"><span><Icon name="info" size={15}/><strong>{demo?'Demonstração — dados de exemplo':trial?'Ensaio — dados fictícios guardados':recovery?'Cópia recuperada — SQLite':'Dados reais — SQLite'}</strong><span className="banner-detail">{demo?'As alterações perdem-se ao recarregar.':home?'Backup nas Definições.':'Backup e exportação nas Definições.'}</span></span>{demo&&<a className="demo-tag" href="/">ABRIR DADOS LOCAIS</a>}</div>
    <header className="topbar"><div className="mobile-navigation" onKeyDown={e=>{if(e.key==='Escape'&&menu){e.preventDefault();closeMenu();}}} onBlur={e=>{if(menu&&!e.currentTarget.contains(e.relatedTarget))setMenu(false);}}>
      <button ref={menuButton} className="button small" aria-expanded={menu} aria-controls="mobile-menu" onClick={()=>menu?closeMenu():setMenu(true)}>Menu</button>
      <div id="mobile-menu" ref={menuPanel} hidden={!menu}>{nav(true)}{home&&signOut}</div>
    </div><span>O meu espaço <span className="muted">/ {navigation.find(n=>n.id===screen)?.label}</span></span><div className="month-controls"><label className="sr-only" htmlFor="month-select">Mês selecionado</label><select id="month-select" disabled={busy||uncertain||conflict} value={s.selected} onChange={e=>safe({type:'month',period:e.target.value},'Mês selecionado.')} aria-label="Mês selecionado">{Object.keys(s.months).sort().map(p=><option key={p} value={p}>{monthLabel(p)}</option>)}</select><button className="button small" disabled={busy||uncertain||conflict} onClick={()=>open('month')}><Icon name="plus" size={16}/>Novo mês</button></div><strong className="mobile-screen-title" aria-hidden="true">{navigation.find(n=>n.id===screen)?.label}</strong></header>
    <main id="main" tabIndex={-1}>
      <p className="sr-only" role="status" aria-atomic="true">{recentPayment&&`${recentPayment.line?.name??m.lines.find(line=>line.id===recentPayment.lineId)?.name??''} · ${receiptText(recentPayment)}`}</p>
      {home&&<button className="text-button refresh-data" disabled={busy||uncertain||conflict||conflict} onClick={async()=>{if(await store.refresh?.())notify('Dados atualizados.');}}>Atualizar dados</button>}
      {!demo&&store.error&&<p className="form-error" role="alert">{store.error}</p>}
      {busy&&<p className="callout" role="status">A confirmar gravação local…</p>}
      {uncertain&&<div className="callout" role="alert"><p>Gravação por confirmar. A tentativa original foi preservada.</p><button className="button" disabled={busy} onClick={retryPending}>Repetir confirmação</button></div>}
      {globalError&&<div id="workspace-error" className="form-error" role="alert"><p>{globalError}</p>{conflict&&<button className="button" onClick={reloadAfterConflict}>Recarregar para voltar a editar</button>}</div>}
      {notice&&<div className="toast" role="status"><Icon name="check" size={18}/><span>{notice}</span><button aria-label="Fechar mensagem" className="icon-button" onClick={()=>setNotice('')}><Icon name="close" size={16}/></button></div>}
      <div className="page-heading">
        <div><span className="eyebrow">{monthLabel(s.selected)}</span><h1>{navigation.find(n=>n.id===screen)?.label}</h1>
          {screen!=='month'&&<p>{({plan:'Consulte o plano e registe o que já aconteceu.',accounts:'Saldos atuais e compromissos por banco.',savings:'Dinheiro separado por finalidade.',recurring:'Lembretes para não deixar passar subscrições e obrigações.',base:'O ponto de partida dos próximos meses.',settings:demo?'Contas e categorias de exemplo.':home?'Backups, contas e categorias.':'Backups, exportação, contas e categorias.'})[screen]}</p>}
        </div>
        {screen==='accounts'?<div className="account-actions">
          <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open('transfer')}><Icon name="transfer" size={17}/>Transferir entre contas</button>
          <button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>open('account')}><Icon name="plus" size={17}/>Adicionar conta</button>
        </div>:screen==='base'?<button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>open('line',{target:'base'})}><Icon name="plus" size={17}/>Adicionar ao modelo</button>:null}
      </div>
      {screen==='month'&&<>
        <section className="metrics" aria-label="Resumo mensal">{([
          {label:'Saldo atual das contas',amount:currentTotal,caption:'Contas à ordem ativas',coverage:balancesKnown.length,
            cause:monthAccounts.length?'Há saldos por indicar.':'Sem contas à ordem ativas.',key:'balance',destination:'Abrir saldos em Contas',go:()=>navigate('accounts','bank-accounts-title')},
          {label:'Despesas por pagar',amount:totals.expenses,caption:'Inclui despesas a pagar por poupanças',cause:'Há despesas com valor por indicar.',key:'expenses',
            destination:'Abrir despesas por pagar no plano',go:()=>showPendingPlan('expense')},
          {label:hasInvestment?'Poupanças e investimentos':'Poupanças',amount:totals.savings,caption:'Reforços que ainda faltam',cause:'Há montantes por indicar.',key:'savings',
            destination:'Abrir reforços planeados em Poupanças',go:()=>navigate('savings','planned-savings-title')},
          {label:'Saldo previsto',amount:forecast.amount,caption:forecastLabel,coverage:forecast.knownCount,cause:forecast.cause,
            destination:'Abrir saldos previstos em Contas',go:()=>navigate('accounts','bank-accounts-title')}
        ] as const).map(({label,amount,caption,cause,destination,go,...metric},i)=>{
          const key='key' in metric?metric.key:undefined,coverage='coverage' in metric?metric.coverage:undefined;
          const expanded=!!key&&expandedMetric===key;
          return <div className="metric-slot" key={label}><article className={`metric ${i===3?'featured':''}`}>
            <div className="metric-heading"><h2 className="metric-title">{label}</h2>
              <button className="icon-button metric-arrow" aria-label={destination} title={destination} onClick={go}><Icon name="arrow" size={18}/></button>
            </div>
            <strong className={isLongAmount(amount)?'long-amount':undefined}>{amount===null?'Por apurar':money(amount)}</strong>
            <small>{caption}</small>
            {amount===null?<small>{cause}</small>:coverage!==undefined&&coverage<monthAccounts.length&&<small>Subtotal · {coverage} de {monthAccounts.length} contas</small>}
            {key&&<button className="text-button metric-toggle" aria-label={`${expanded?'Ocultar':'Ver'} detalhe: ${label}`}
              aria-expanded={expanded} aria-controls={`metric-${key}`} onClick={()=>setExpandedMetric(expanded?null:key)}>
              {expanded?'Ocultar detalhe':'Ver detalhe'} <Icon name="chevron" size={15}/>
            </button>}
          </article>{key&&<div className="metric-detail" id={`metric-${key}`} hidden={!expanded}>
            {key==='balance'?<><p>{balancesKnown.length} de {monthAccounts.length} contas com saldo conhecido.</p>
              <dl>{monthAccounts.map(({account,current})=><div key={account.id}><dt>{account.name}</dt><dd>{current===null?'Saldo por indicar':money(current)}</dd></div>)}</dl></>
              :key==='savings'?savingCommitments.length?<><dl>{savingCommitments.map(line=><div key={line.id}>
                <dt>{line.name}</dt><dd>{money(pending(m,line))}</dd>
              </div>)}</dl>{hasInvestment&&<button className="text-button metric-toggle" onClick={()=>showPendingPlan('investment')}>Ver investimentos no plano<Icon name="arrow" size={15}/></button>}</>:<p>Sem reforços ou investimentos por realizar.</p>
              :expenseGroups.size===0?<p>Sem despesas por pagar.</p>:Array.from(expenseGroups,([source,rows])=><div key={source}>
                <h3>{source?sourceName(source):'Origem por apurar'}</h3>
                <dl>{rows.map(({line,amount})=><div key={line.id}><dt>{line.name}</dt><dd>{amount===null?'Valor por apurar':money(amount)}</dd></div>)}</dl>
              </div>)}
          </div>}</div>;
        })}</section>
        {shortages.length>0&&<div className="funds-alert"><Icon name="info" size={18}/><p><strong>Fundos insuficientes por conta</strong><span>{shortages.map(x=>`${x.name}: faltam ${money(x.amount)}`).join(' · ')}</span></p><button className="text-button" onClick={()=>navigate('accounts')}>Ver contas<Icon name="arrow" size={15}/></button></div>}
        {reserveWarnings.length>0&&<section className="panel reserve-alerts" aria-label="Disponibilidade nas reservas">
          <h2>Disponibilidade nas reservas</h2>
          {reserveWarnings.map(row=><div className="reserve-alert" key={row.reserve.id}>
            <p><strong>{reserveLabel(row.reserve)} · {nameOf(row.reserve.accountId)}</strong><br/>{reserveWarningText(row)}</p>
            <button className="text-button" onClick={()=>showReserve(row.reserve.id)}>Ver reserva<Icon name="arrow" size={15}/></button>
          </div>)}
        </section>}
        <div className="month-summary-panels">
          <BudgetRemainders month={m} onOpenSavings={()=>navigate('savings')}/>
          <section className="panel" aria-labelledby="month-accounts-title">
            <div className="section-top"><h2 id="month-accounts-title">Saldos atuais e previstos</h2><Icon name="accounts" size={18}/></div>
            <p className="account-summary-caption">Contas à ordem ativas. O saldo previsto desconta as saídas ainda planeadas.</p>
            <div className="account-mini-list">
              {monthAccounts.length===0&&<p className="tiny">Sem contas à ordem ativas.</p>}
              {monthAccounts.map(({account,current,forecast})=><div className={`account-mini${[current,forecast].some(isLongAmount)?' wide-amounts':''}`} key={account.id}>
                {accountBadge(account.id)}
                <dl><div><dt>Atual</dt><dd>{money(current)}</dd></div><div><dt>Previsto</dt><dd className={forecast!==null&&forecast<0?'negative':undefined}>{money(forecast)}</dd></div></dl>
              </div>)}
            </div>
            <button className="text-button panel-link" onClick={()=>navigate('accounts')}>Ver contas<Icon name="arrow" size={16}/></button>
          </section>
          {upcomingReminders.length>0&&<section className="panel advance-reminders" aria-labelledby="advance-reminders-title">
            <div className="section-top"><h2 id="advance-reminders-title">Lembretes de pagamentos</h2><Icon name="bell" size={18}/></div>
            <ul>{upcomingReminders.map(item=><li key={item.id}><strong>{item.text}</strong><small>{item.name} · pagamento a {dateLabel(item.date)}</small></li>)}</ul>
          </section>}
        </div>
        <div className="section-links month-quick-links"><button className="text-button" onClick={()=>navigate('plan')}>Ver plano e movimentos</button><button className="text-button" onClick={()=>navigate('recurring')}>Rever lembretes <span>{m.occurrences.filter(o=>o.state==='open').length} por rever</span></button><a href="#budget-title">Ver sobras do mês</a></div>
        {m.excelImport&&<section className="panel spaced" aria-label="Referência de novembro no Excel"><div className="section-top"><h2>Referência do Excel</h2></div><div className="definition-row"><div><strong>Distribuição do orçamento por conta</strong><p>Valores de planeamento da folha {m.excelImport.sheet}. Os saldos bancários são registados à parte.</p><details><summary>Ver valores da folha</summary><dl>{m.excelImport.allocations.map(row=><div key={row.name}><dt>{row.name}</dt><dd>{money(row.amount)}</dd></div>)}</dl></details></div></div></section>}
        <div className="plan-bar" id="initial-plan"><div><span><strong>{m.snapshot?`Plano inicial guardado · ${dateLabel(m.snapshot.date)}`:'Plano inicial ainda não guardado'}</strong><small>Referência para comparar com o plano atual.</small></span></div><button className="text-button" disabled={busy||uncertain||conflict||!!m.snapshot} onClick={()=>safe({type:'snapshot',date:calendarDate()},'Plano inicial guardado nesta simulação.')}>{m.snapshot?'Referência preservada':'Guardar plano inicial'}</button></div>
      </>}
      {screen==='plan'&&<>
        <section className="panel plan-movements">
          <div className={`tabs${monthKinds.length>3?' tabs-with-investment':''}`} role="tablist" aria-label="Tipos de movimento">
            {monthKinds.map(k=><button role="tab" key={k} id={`tab-${k}`} aria-selected={tab===k} aria-controls="movement-panel"
              onClick={()=>{setTab(k);setSearch('');setPendingOnly(false);}} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
                e.preventDefault();const next=monthKinds[(monthKinds.indexOf(k)+(e.key==='ArrowRight'?1:monthKinds.length-1))%monthKinds.length];
                setTab(next);setSearch('');setPendingOnly(false);document.getElementById(`tab-${next}`)?.focus();
              }}} tabIndex={tab===k?0:-1}>{monthKindLabel[k]}<span>{m.lines.filter(l=>l.kind===k).length}</span></button>)}
          </div>
          <div className="plan-total">
            <span>{monthKindTotal[tab]} <small>Plano atual do mês</small></span>
            <div><strong>{tabLines.length&&!plannedCount?'Por apurar':money(planTotal(m,tab))}</strong>
              {plannedCount<tabLines.length&&<small>{plannedCount?`Subtotal · ${plannedCount} de ${tabLines.length} movimentos`:'Valores por indicar no plano'}</small>}
            </div>
          </div>
          <div className="list-toolbar plan-toolbar">
            <input aria-label="Pesquisar movimentos" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar movimento…"/>
            <button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>open(tab==='saving'?'goal':'line',{kind:tab})}>
              <Icon name="plus" size={17}/>{createLabel[tab]}
            </button>
          </div>
          {pendingOnly&&<div className="plan-filter"><span>A mostrar por realizar</span><button className="text-button" onClick={()=>setPendingOnly(false)}>Ver todos os movimentos</button></div>}
          <div id="movement-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>{search.trim()&&!filtered.length?noResults(()=>setSearch('')):pendingOnly&&!visibleLines.length?<div className="empty">Sem movimentos por realizar.</div>:lineList(filtered)}</div>
        </section>
      </>}
      {screen==='accounts'&&<><AccountFunding state={s} month={m} demo={demo} open={fundingOpen} onOpenChange={setFundingOpen} busy={busy} uncertain={uncertain} disabled={busy||uncertain||conflict} revision={store.revision} dateDefault={dateDefault()} refresh={store.refresh} retry={store.retry?async()=>{await store.retry!();notify('Gravação local confirmada sem duplicar efeitos.');}:undefined} onPrepare={(account,amount,source,date)=>{open('transfer',{returnTo:'funding-launch'});setValues(v=>({...v,source:aid(source.id),destination:aid(account.id),amount:inputMoney(amount),date}));}} onRecord={(action,revision)=>run(action,`${action.routes.length} ${action.routes.length===1?'transferência registada':'transferências registadas'} nesta simulação.`,undefined,revision)}/><section className="metrics account-totals" aria-label="Totais de contas e poupanças">
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
        <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open('reserve')}>Criar poupança</button>
        <div className="callout savings-explainer"><Icon name="leaf"/><p>Quando põe dinheiro numa poupança, o saldo disponível na conta à ordem baixa e o saldo da poupança aumenta. Se pagar uma despesa com esse dinheiro, o valor é descontado da poupança.</p></div>
        {!s.reserves.length&&<div className="empty"><h2>Ainda não tem poupanças</h2><p>Crie uma poupança para indicar o saldo acumulado e definir um objetivo para o mês.</p></div>}
        <div className="account-grid">{s.reserves.map(r=>{
          const key=rid(r.id),b=balance(m,key),goalLines=savingGoals(m,r.id),progress=savingProgress(m,r.id);
          const extra=sum(activeEvents(m).map(e=>freeSaving(m,e,r.id)));
          const warning=reserveWarnings.find(row=>row.reserve.id===r.id);
          const canAssociate=goalLines.some(l=>(pending(m,l)??0)>0&&activeEvents(m).some(e=>
            freeSaving(m,e,r.id)>0&&!activeEvents(m).some(x=>x.savingParentId===e.id&&x.lineId===l.id)));
          return <article className="panel account-card savings-card" id={`reserve-${r.id}`} tabIndex={-1} key={r.id}>
            <div className="section-top"><h2>{reserveLabel(r)}</h2><Icon name="savings"/></div>{accountBadge(r.accountId)}
            <strong className="balance-value">{money(b)}</strong><span className="tiny">Total acumulado da poupança</span>
            <button className="button" disabled={busy||uncertain||conflict} onClick={()=>open(b===null?'initial':'reconcile',{source:key})}>
              {b===null?'Introduzir Total Acumulado da Poupança':'Atualizar montante total poupado'}
            </button>
            <dl className="savings-progress">
              <div><dt>Objetivo do mês</dt><dd>{goalLines.length?money(progress.target):'Por definir'}</dd></div>
              <div><dt>Já poupado para o objetivo</dt><dd>{money(progress.saved)}</dd></div>
              <div><dt>Falta poupar</dt><dd>{goalLines.length?money(progress.remaining):'Por definir'}</dd></div>
              <div><dt>Reforços extra deste mês</dt><dd>{money(extra)}</dd></div>
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
          {lineList(s.base.filter(l=>l.kind===k),k)}
        </section>)}</>}
      {screen==='settings'&&<>{!demo&&<LocalFiles home={home}/>} {trial&&<TrialChecks home={home}/>} <div className="callout"><Icon name="info"/><p>Desativar uma conta ou arquivar uma categoria retira-a das novas seleções e preserva as referências existentes.</p></div><div className="settings-grid">{(['account','category'] as const).map(type=>{
        const items=type==='account'?s.accounts:s.categories;
        const update=(filter:string)=>setCatalogSearch(previous=>({...previous,[type]:filter}));
        const visible=items.filter(item=>matches(item.name,catalogSearch[type]));
        return <section className="panel" key={type}><div className="section-top"><h2>{type==='account'?'Contas':'Categorias'}</h2><button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>open(type)}><Icon name="plus" size={16}/>Adicionar</button></div><input className="catalog-search" aria-label={`Pesquisar ${type==='account'?'contas':'categorias'}`} placeholder="Pesquisar…" value={catalogSearch[type]} onChange={e=>update(e.target.value)}/>{!items.length?<div className="empty">Ainda sem {type==='account'?'contas':'categorias'}</div>:!visible.length?noResults(()=>update('')):visible.map(item=><div className="catalog-row" key={item.id}><span>{type==='account'?accountBadge(item.id):item.name}{item.archived&&<small> · {type==='account'?'Desativada':'Arquivada'}</small>}</span><div><button className="text-button" disabled={busy||uncertain||conflict} onClick={()=>open(type,{id:item.id})}>Editar</button><button className="text-button muted" disabled={busy||uncertain||conflict} onClick={()=>type==='account'?toggleAccount(s.accounts.find(a=>a.id===item.id)!):safe({type:'category',category:{...item,archived:!item.archived}},item.archived?'Categoria reativada.':'Categoria arquivada. Referências preservadas.')}>{item.archived?'Reativar':type==='account'?'Desativar':'Arquivar'}</button></div></div>)}</section>;})}</div>{demo&&<section className="panel spaced"><div className="section-top"><h2>Sobre esta demonstração</h2></div><p className="panel-intro">Estado em memória. Recarregar repõe todos os exemplos. Não altera a base local.</p><button className="button" disabled={busy||uncertain||conflict} onClick={()=>open('reset')}>Repor exemplos</button></section>}</>}
      <footer className="page-footer"><span>O meu mês <span>·</span> Cada mês, um novo ponto de partida.</span><span>{demo?'Exemplos em memória':'SQLite local'}</span></footer>
    </main></div>
    {modal&&<Dialog title={titles[modal.kind]} onClose={close} demo={demo} returnTo={modal.returnTo}>{conflict&&<div className="callout" role="alert"><p>Os dados mudaram desde que abriu esta edição.</p><button className="button" onClick={reloadAfterConflict}>Recarregar para voltar a editar</button></div>}{busy&&<p className="callout" role="status">A confirmar gravação local…</p>}{uncertain&&<div className="callout"><p>Resposta por confirmar. Repita a mesma tentativa com segurança.</p><button className="button" disabled={busy} onClick={retryPending}>Repetir confirmação</button></div>}{modal.kind==='detail'&&selectedLine?<>
      <div className="dialog-body"><div className="detail-subheading">{accountBadge(selectedLine.accountId)}<span className="pill">{status(selectedLine)}</span></div><dl className="detail-values"><div><dt>Plano inicial {m.snapshot?`· ${dateLabel(m.snapshot.date)}`:'· ainda não guardado'}</dt><dd>{m.snapshot?money(initialPlan(m,selectedLine)):'Sem referência'}</dd></div><div><dt>{selectedLine.kind==='saving'?'Objetivo do mês':'Plano atual'}</dt><dd>{money(selectedLine.plan)}</dd></div>{selectedReminder&&<div><dt>Data do lembrete</dt><dd>{dateLabel(selectedReminder.date)}</dd></div>}{m.snapshot?.reminderDates?.[selectedLine.id]&&<div><dt>Data na referência inicial</dt><dd>{dateLabel(m.snapshot.reminderDates[selectedLine.id])}</dd></div>}<div><dt>{selectedLine.kind==='saving'?'Já poupado para o objetivo':'Realizado'}</dt><dd>{money(realized(m,selectedLine.id))}</dd></div><div><dt>{selectedLine.kind==='saving'?'Falta poupar':'Por realizar'}</dt><dd>{money(pending(m,selectedLine))}</dd></div><div><dt>Desvio realizado face ao plano atual</dt><dd>{selectedLine.plan==null?'Por indicar':`${realized(m,selectedLine.id)>selectedLine.plan?'+':''}${money(realized(m,selectedLine.id)-selectedLine.plan)}`}</dd></div>{m.snapshot&&<div><dt>Alteração do plano face ao inicial</dt><dd>{selectedLine.plan==null||initialPlan(m,selectedLine)==null?'Por indicar':money(selectedLine.plan-initialPlan(m,selectedLine)!)}</dd></div>}</dl>{m.snapshot&&!m.snapshot.lines.some(l=>l.id===selectedLine.id)&&<p className="warning">Adicionado depois do plano inicial. Referência inicial: 0,00 €.</p>}<div className="detail-buttons">
        {!completed(m,selectedLine.id)&&<button className="button primary" disabled={busy||uncertain||conflict} onClick={()=>selectedLine.kind==='saving'
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
        <p className="preview" aria-live="polite">{s.months[value('period')]?'Já existe. Vai reabrir o plano, os lembretes e os registos guardados.':`Mês novo · ${s.base.length} definições do Modelo Base. Os saldos ficam por indicar e a execução começa vazia.`}</p></>}
      {['initial','reconcile'].includes(modal.kind)&&<>
        <p className="scope-label"><strong>{sourceName(modal.source!)}</strong></p>
        {amountField(savingsInitial?'Total que vê hoje no banco (€)':modal.kind==='initial'?'Saldo inicial deste mês (€)':'Saldo observado no banco (€)')}
        {suggestedBalance&&<p className="preview">Sugestão editável · saldo calculado em {monthLabel(suggestedBalance.period)}: {money(suggestedBalance.amount)}. Confirme o total que vê hoje no banco.</p>}
        {savingsInitial&&<p className="preview">Saldo calculado neste mês: {observedBalance===null?'Por indicar':money(observedBalance)}.
          {observedBalance!==null&&enteredAmount!==null&&<> Diferença a registar: {money(sum([enteredAmount,-observedBalance]))}.</>}
        </p>}
        {modal.kind==='reconcile'&&<>{dateField}<label>Motivo da diferença<input name="note" aria-invalid={invalidField('NOTE')} aria-describedby={invalidField('NOTE')?'form-error':undefined} value={value('note')} onChange={e=>set('note',e.target.value)} placeholder="Ex.: diferença identificada na conferência" required/>{fieldError('NOTE')}</label>
          {!savingsInitial&&<p className="preview">Saldo calculado: {money(observedBalance)}. A diferença fica no histórico.</p>}
        </>}
        {modal.kind==='initial'&&!savingsInitial&&<p className="preview">Indique o saldo da conta à ordem, separado das poupanças.</p>}
      </>}
      {modal.kind==='payment'&&selectedLine&&<><p><strong>{selectedLine.name}</strong> · previsto {money(selectedLine.plan)} · falta {money(pending(m,selectedLine))}</p>{selectedLine.variable&&!modal.otherBank&&<label>Tipo de registo<select value={value('mode')} onChange={e=>{set('mode',e.target.value);set('amount',e.target.value==='total'?inputMoney(realized(m,selectedLine.id)):'' );}}><option value="purchase">Compra individual</option><option value="total">Total acumulado</option><option value="detail">Detalhar compra já incluída num total</option></select></label>}{selectedLine.variable&&value('mode')!=='total'&&<label>Nome da compra (opcional)<input value={value('description')} onChange={e=>set('description',e.target.value)} placeholder="Ex.: Continente ou Mercearia" maxLength={120}/></label>}{value('mode')==='detail'&&<><label>Ajuste que já inclui esta compra<select aria-invalid={invalidField('DETAIL')} aria-describedby={invalidField('DETAIL')?'form-error':undefined} value={value('totalId')} onChange={e=>set('totalId',e.target.value)} required><option value="">Escolha o ajuste</option>{activeEvents(m).filter(e=>e.lineId===selectedLine.id&&e.type==='total'&&e.amount>0&&totalUnallocated(m,e)>0).map(e=><option key={e.id} value={e.id}>{dateLabel(e.date)} · {money(totalUnallocated(m,e))} por detalhar · {Object.keys(e.deltas).map(sourceName).join(', ')}</option>)}</select>{fieldError('DETAIL')}</label><p className="preview">Use a mesma origem do ajuste. Este detalhe identifica uma compra já contabilizada e não aumenta o gasto nem volta a descontar dinheiro.</p></>}{amountField(value('mode')==='total'?'Total gasto até à data (€)':'Montante (€)')}<div className="form-two">{dateField}{sourceField(selectedLine.kind==='income'?'Banco onde recebe o dinheiro':modal.otherBank?'Banco de onde saiu o dinheiro':'Origem do dinheiro','source',expensePaymentSources)}</div>{selectedLine.kind==='expense'&&value('mode')!=='detail'&&<p className="tiny">Escolha a conta ou reserva que usou. No plano: {sourceName(selectedLine.reserveId?rid(selectedLine.reserveId):aid(selectedLine.accountId))}.</p>}{selectedLine.kind==='saving'&&<p className="preview">Destino: {sourceName(rid(selectedLine.reserveId!))}. Não conta como despesa.</p>}{selectedLine.kind==='investment'&&<p className="preview">A aplicação reduz o saldo da conta principal e fica no histórico. O valor da carteira não é acompanhado nesta aplicação.</p>}{value('mode')==='total'&&totalPreviewBox}{!selectedLine.variable&&value('mode')!=='detail'&&<label className="checkbox"><input type="checkbox" checked={value('complete')==='true'} onChange={e=>set('complete',e.target.checked?'true':'false')}/>Concluir por este valor, mesmo que diferente do previsto</label>}<p className="tiny">O estado e o saldo mudam após confirmar. Pode anular o registo no detalhe para o corrigir.</p></>}
      {modal.kind==='line'&&<>
        {nameField}
        {modal.target&&<label>Tipo<select value={value('kind')} onChange={e=>{set('kind',e.target.value);set('reserve','');}}><option value="expense">Despesa</option><option value="income">Receita</option><option value="saving">Reforço de poupança</option><option value="investment">Investimento</option></select></label>}
        {value('kind')==='expense'&&<label>Tipo de despesa<select value={value('variable')||'false'} onChange={e=>set('variable',e.target.value)}>
          <option value="false">Despesa com pagamento</option><option value="true">Orçamento com compras individuais</option>
        </select><small>{value('variable')==='true'?'Registe várias compras ou acerte o total gasto, por exemplo em Comida.':'Registe um pagamento ou várias parcelas, por exemplo no Seguro do Carro.'}</small></label>}
        {!modal.target&&!modal.id&&['expense','income'].includes(value('kind'))&&<label>Estado do registo<select value={value('when')||'pending'} onChange={e=>set('when',e.target.value)}>
          <option value="pending">{value('kind')==='income'?'Ainda espero receber':'Ainda por pagar'}</option>
          <option value="done">{value('kind')==='income'?'Já recebi':'Já paguei'}</option>
        </select></label>}
        {amountField(modal.target?'Montante habitual (€) · opcional':immediate&&value('variable')!=='true'?value('kind')==='income'?'Montante recebido (€)':'Montante pago (€)':'Plano atual (€) · opcional',
          !!immediate&&value('variable')!=='true',immediate&&value('variable')!=='true'?undefined:'Deixe em branco se ainda não sabe o valor.')}
        {immediate&&value('variable')==='true'&&<>
          <label>Montante da compra (€)<input inputMode="decimal" value={value('actual')} onChange={e=>set('actual',e.target.value)}
            aria-invalid={invalidField('ACTUAL')} aria-describedby={invalidField('ACTUAL')?'form-error':undefined} required/>{fieldError('ACTUAL')}</label>
          <label>Nome da compra (opcional)<input value={value('description')} onChange={e=>set('description',e.target.value)} maxLength={120}/></label>
        </>}
        {immediate&&dateField}{accountField}
        {(value('kind')!=='income'||modal.target)&&<Choice label="Categoria" name="category" options={s.categories.filter(c=>!c.archived||c.id===value('category'))} value={value('category')} onChange={v=>set('category',v)} invalid={invalidField('CATEGORY')} error={fieldError('CATEGORY')}/>}
        {(value('kind')==='saving'||value('kind')==='expense')&&reserveSelect}
        {modal.id&&<button type="button" className="text-button danger" onClick={async()=>{try{await run({type:'removeLine',id:modal.id!,target:modal.target},modal.target?'Definição removida do Modelo Base.':'Movimento removido do plano atual.',modal.requestId,modal.revision);close();}catch(e){formFailure(e);}}}>Remover do {modal.target==='base'?'Modelo Base':'plano atual'}</button>}
      </>}
      {modal.kind==='goal'&&<>
        {!modal.reserveId&&<><label>Poupança<select data-initial-focus value={value('reserve')} aria-invalid={invalidField('RESERVE')} aria-describedby={invalidField('RESERVE')?'form-error':undefined} onChange={e=>{
          const id=e.target.value,existing=savingGoals(m,id);
          set('reserve',id);set('goalId',existing.length===1?existing[0].id:'');
          set('amount',existing.length===1?inputMoney(existing[0].plan):'');
        }}><option value="">Escolha a poupança</option>{s.reserves.map(r=><option key={r.id} value={r.id}>{reserveLabel(r)} · {nameOf(r.accountId)}</option>)}</select>{fieldError('RESERVE')}</label>
          <button type="button" className="text-button" onClick={()=>open('reserve')}>Criar poupança</button></>}
        {reserveForm&&<><p><strong>{reserveLabel(reserveForm)}</strong> · {nameOf(reserveForm.accountId)}</p>
          {goals.length>1&&goalSelect(goals,id=>{set('goalId',id);set('amount',inputMoney(goals.find(l=>l.id===id)?.plan));})}
          {amountField('Quanto quer poupar este mês? (€)')}
          <p className="preview">Objetivo para {monthLabel(m.period)}. O total acumulado é indicado no cartão da poupança.</p>
        </>}
      </>}
      {modal.kind==='save'&&reserveForm&&<>
        <p><strong>{reserveLabel(reserveForm)}</strong> · Poupança em {nameOf(reserveForm.accountId)}</p>
        <label>Tipo de reforço<select value={value('savingMode')} onChange={e=>{set('savingMode',e.target.value);set('amount',e.target.value==='goal'?inputMoney(goalForSaving?pending(m,goalForSaving):null):'');}}>
          {openGoals.length>0&&<option value="goal">Poupar para o objetivo do mês</option>}
          <option value="extra">Reforço extra</option>
        </select></label>
        {value('savingMode')==='goal'&&(openGoals.length>1?goalSelect(openGoals,id=>{
          const goal=openGoals.find(l=>l.id===id);
          set('goalId',id);set('amount',inputMoney(goal?pending(m,goal):null));
        }):<p>Falta poupar {money(goalForSaving?pending(m,goalForSaving):null)} para o objetivo.</p>)}
        {sourceField('De que banco sai o dinheiro?','source',selectableBanks)}
        <p aria-live="polite">{value('source')?<>{sourceName(value('source'))} · {bankAvailable===null?'Saldo por indicar':`${money(bankAvailable)} disponíveis`}</>:'Escolha o banco que fez o débito.'}</p>
        <div className="form-two">{amountField()}{dateField}</div>
        <div className="preview saving-preview">
          <h3>Efeitos do registo</h3>
          {separateBank&&<p>Transferência própria de {sourceName(value('source'))} para {nameOf(reserveForm.accountId)}: {money(enteredAmount)}.</p>}
          <p>Reforço de {nameOf(reserveForm.accountId)} para {reserveLabel(reserveForm)}: {money(enteredAmount)}.</p>
          {savingAmount>0&&<p>{money(savingAmount)} para o objetivo do mês.</p>}
          {extraAmount!==null&&extraAmount>0&&<p>{money(extraAmount)} de reforço extra.</p>}
          <p>Registe aqui as operações que efetuou no banco. Se já registou a transferência, escolha o banco onde o dinheiro já se encontra.</p>
        </div>
      </>}
      {modal.kind==='associateSaving'&&reserveForm&&<>
        <p><strong>{reserveLabel(reserveForm)}</strong> · {monthLabel(m.period)}</p>
        {goalSelect(openGoals,id=>{set('goalId',id);set('savingEvent','');set('amount','');})}
        <label>Reforço registado<select value={value('savingEvent')} onChange={e=>{
          const entry=associationOptions.find(event=>event.id===e.target.value);
          set('savingEvent',e.target.value);set('amount',entry&&goalForSaving?inputMoney(Math.min(freeSaving(m,entry,reserveForm.id),pending(m,goalForSaving)??0)):'');
        }} aria-invalid={invalidField('SAVING_EVENT')} aria-describedby={invalidField('SAVING_EVENT')?'form-error':undefined}>
          <option value="">Escolha o reforço</option>{associationOptions.map((e,index)=><option key={e.id} value={e.id}>{dateLabel(e.date)} · {money(e.deltas[savingSource])} · {money(freeSaving(m,e,reserveForm.id))} por associar · Registo {index+1}</option>)}
        </select>{fieldError('SAVING_EVENT')}</label>
        {!associationOptions.length&&<p>Sem reforços disponíveis para este objetivo.</p>}
        {amountField('Montante a associar (€)')}
        <p className="preview">A associação atualiza o objetivo. O saldo do banco e o total acumulado da poupança mantêm-se.</p>
      </>}
      {modal.kind==='transfer'&&<><p>Operação entre contas próprias ou reservas. Não cria receita nem despesa. A devolução de uma reserva à conta principal é uma transferência distinta.</p>{sourceField()}{sourceField('Destino','destination')}{value('destination')&&<p className="preview">Destino do registo · <strong>{sourceName(value('destination'))}</strong></p>}{amountField()}{dateField}</>}
      {modal.kind==='link'&&reminder&&<>
        <p><strong>{reminder.name}</strong> · {dateLabel(reminder.date)} · {money(reminder.amount)}</p>
        <label>Movimento existente<select data-initial-focus value={value('lineId')} onChange={e=>set('lineId',e.target.value)} required>
          <option value="">Escolha uma despesa</option>
          {linkOptions.map(l=><option key={l.id} value={l.id}>{l.name} · {nameOf(l.accountId)} · {money(l.plan)}</option>)}
        </select></label>
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
        <p className="preview">O montante em branco fica por indicar. Se escolher uma reserva, a conta é preenchida automaticamente.</p>
      </>}
      {modal.kind==='reserve'&&<><label>Nome da poupança<input autoFocus value={value('name')} onChange={e=>set('name',e.target.value)} aria-invalid={invalidField('NAME')} aria-describedby={invalidField('NAME')?'form-error':undefined} required/>{fieldError('NAME')}</label>{accountField}<p className="preview">Depois pode indicar o total acumulado e definir quanto quer poupar neste mês.</p></>}
      {['account','category'].includes(modal.kind)&&<><label>Nome<input autoFocus value={value('name')} onChange={e=>set('name',e.target.value)} aria-invalid={invalidField('NAME')} aria-describedby={invalidField('NAME')?'form-error':undefined} required/>{fieldError('NAME')}</label>{modal.kind==='account'&&<><label>Cor de identificação<input type="color" value={value('color')||'#7a9c8c'} onChange={e=>set('color',e.target.value)}/></label></>}</>}
      {modal.kind==='reset'&&<p>Vai perder todas as alterações feitas nesta simulação e voltar aos exemplos iniciais. Esta ação não altera ficheiros nem qualquer base de dados.</p>}
      {error&&!fieldCode&&<div id="form-error" role="alert" className="form-error"><p>{error}</p>

      </div>}
    </div><div className="dialog-footer"><button type="button" className="button" onClick={close}>Cancelar</button><button className={`button ${modal.kind==='deleteAccount'?'danger':'primary'}`} type="submit" disabled={conflict||modal.kind==='link'&&!linkTarget}>{modal.kind==='deleteAccount'?'Eliminar definitivamente':modal.kind==='reset'?'Repor exemplos':modal.kind==='month'?'Abrir mês':missingBalances.length?'Confirmar saldos e registo':modal.kind==='payment'?'Confirmar registo':'Confirmar'}</button></div></fieldset></form>}</Dialog>}
  </div>;

  function history(source?:string,lineId?:string){
    const events=m.events.filter(e=>lineId?e.lineId===lineId:source&&(e.deltas[source]!=null||
      !!e.savingParentId&&m.events.some(parent=>parent.id===e.savingParentId&&parent.deltas[source]>0)));
    if(!events.length)return <p className="empty-history">Ainda sem registos neste mês.</p>;
    return <div className="history">{events.map(e=><div className={e.voided?'voided':''} key={e.id}
      tabIndex={modal?.eventId===e.id?-1:undefined} data-initial-focus={modal?.eventId===e.id?true:undefined}>
      <div><strong>{e.description||e.note}</strong>{e.description&&<small>{e.note}</small>}
        <small>{dateLabel(e.date)}{e.voided?' · Anulado':''}{lineId&&e.type==='total'?' · ajuste, sem nova compra':e.type==='detail'?' · já incluída, sem novo gasto':''}</small>
        {e.saving&&<small>{money(e.amount)} para o objetivo · {money(e.saving.extra)} de reforço extra{e.saving.transferId?' · Com transferência própria associada':''}</small>}
        {e.savingParentId&&<small>{money(e.amount)} associados · Sem alteração aos saldos</small>}
        <small>{Object.entries(e.deltas).map(([key,delta])=>`${key.startsWith('r:')?sourceName(key):(e.sourceNames?.[key]??sourceName(key))}: ${delta>0?'+':''}${money(delta)}`).join(' · ')}</small>
        <span>{money(lineId?e.purchaseAmount??e.amount:source?e.deltas[source]??e.amount:e.amount)}</span>
      </div>
      {!e.voided&&<button className="text-button danger" disabled={busy||uncertain||conflict} onClick={()=>safe({type:'void',id:e.id},
        e.saving?.transferId||activeEvents(m).some(x=>x.saving?.transferId===e.id)?'Transferência e reforço anulados. Os saldos foram atualizados.':'Registo anulado. Os valores foram atualizados.')}>Anular</button>}
    </div>)}</div>;
  }
}

