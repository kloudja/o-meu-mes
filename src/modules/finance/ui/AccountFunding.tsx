'use client';
import { useEffect, useRef, useState } from 'react';
import { canonical, type Action } from '../domain/actions';
import { accountFunding, transferRoutes } from '@/modules/finance/domain/funding';
import { money } from '@/modules/finance/domain/money';
import { daysInMonth, DomainError, sum, validDate } from '@/modules/finance/domain/validation';
import type { Account, Month } from '@/modules/finance/domain/model';
import type { Confirmed } from '../contracts/command';
import { Dialog } from '../../../shared/ui/Dialog';
import { Icon } from '../../../shared/ui/Icon';
import { PaymentReasons } from './PaymentReasons';

type Batch = Extract<Action,{type:'recordSuggestedTransfers'}>;
interface Props {
  month:Month;open:boolean;onOpenChange:(open:boolean)=>void;
  report:ReturnType<typeof accountFunding>;
  busy:boolean;uncertain:boolean;disabled:boolean;dateDefault:string;revision?:number;
  onPrepare:(account:Account,amount:number,source:Account,date:string)=>void;
  onRecord:(action:Batch,revision?:number)=>Promise<void>;
  refresh?:()=>Promise<Confirmed|false>;retry?:()=>Promise<void>;
}

export function AccountFunding(props:Props){
  const {suggested,total,reimbursements}=props.report;
  const amount=suggested===0&&total===null?'Por apurar':money(suggested);
  return <>
    <section className="panel funding-launch" aria-label="Preparar dinheiro nas contas">
      <div><h2>Dinheiro necessário em cada conta</h2><p>Veja as transferências para repor pagamentos feitos por outra conta e cobrir os compromissos do mês.</p>
        {reimbursements.length>0&&<p className="funding-reimbursements">Pagamentos por outra conta · {money(sum(reimbursements.map(row=>row.amount)))} por repor</p>}
      </div>
      <button id="funding-launch" className="button primary" disabled={props.disabled} onClick={()=>props.onOpenChange(true)}>
        <Icon name="transfer" size={17}/><span>Quanto transferir para cada conta</span><strong className="funding-button-amount">{amount}</strong>
      </button>
    </section>
    {props.open&&<FundingReview {...props}/>}
  </>;
}

function FundingReview({month,report,onOpenChange,busy,uncertain,disabled,dateDefault,revision,onPrepare,onRecord,refresh,retry}:Props){
  const current={period:month.period,revision,report};
  const [review,setReview]=useState(current);
  const [date,setDate]=useState(dateDefault);
  const [error,setError]=useState<{code:string;message:string}|null>(null);
  const [refreshing,setRefreshing]=useState(false);
  const dateInput=useRef<HTMLInputElement>(null);
  const reviewButton=useRef<HTMLButtonElement>(null);
  const reviewAlert=useRef<HTMLDivElement>(null);
  const submitting=useRef(false);
  const {suggestions,remaining,unassigned,suggested,accounts,reimbursements}=review.report;
  const routes=transferRoutes(suggestions);
  const sameMonth=review.period===month.period;
  const changed=!sameMonth||canonical(routes)!==canonical(transferRoutes(report.suggestions));
  const altered=sameMonth&&suggestions.flatMap(previous=>{
    const next=report.suggestions.find(route=>route.source.id===previous.source.id&&route.destination.id===previous.destination.id);
    return next&&next.amount!==previous.amount?[{previous,next}]:[];
  })[0];
  const stale=changed||review.revision!==revision||error?.code==='CONFLICT'||error?.code==='BATCH_CHANGED';
  const dateError=error?.code==='DATE';
  const blocked=disabled||refreshing;
  const close=()=>{if(!busy&&!refreshing)onOpenChange(false);};
  useEffect(()=>{
    if(stale&&!busy&&!uncertain)reviewAlert.current?.scrollIntoView({block:'nearest'});
  },[stale,busy,uncertain]);

  async function failed(e:unknown){
    const code=e instanceof DomainError?e.code:'';
    setError({code,message:(e as Error).message});
    if(code==='CONFLICT'||code==='BATCH_CHANGED'){
      setRefreshing(true);
      try{await refresh?.();}finally{setRefreshing(false);}
      requestAnimationFrame(()=>reviewButton.current?.focus());
    }
    if(code==='DATE')requestAnimationFrame(()=>dateInput.current?.focus());
  }
  async function record(){
    if(blocked||stale||submitting.current)return;
    submitting.current=true;
    try{
      validDate(date,review.period);
      await onRecord({type:'recordSuggestedTransfers',period:review.period,date,routes},review.revision);
      onOpenChange(false);
    }catch(e){await failed(e);}
    finally{submitting.current=false;}
  }
  async function reviewAgain(){
    setRefreshing(true);
    try{
      const latest=await refresh?.();
      if(latest===false){
        setError({code:'CONFLICT',message:'Não foi possível atualizar os dados. Tente rever a lista novamente.'});
        return;
      }
      setError(null);
      if(latest){
        const period=latest.state.selected;
        if(period!==review.period)setDate(dateDefault);
        setReview({period,revision:latest.revision,report:accountFunding(latest.state,latest.state.months[period])});
      }else setReview(current);
    }finally{setRefreshing(false);}
  }
  return <Dialog title="Quanto transferir para cada conta" onClose={close}>
    <div className="dialog-body funding-body">
      {stale&&!uncertain&&<div ref={reviewAlert} className="warning" role="alert">
        <p>{!sameMonth?'O mês mudou.':changed?'As origens, os destinos ou os montantes sugeridos mudaram desde a revisão.':error?.code==='CONFLICT'||error?.code==='BATCH_CHANGED'?error.message:'Os dados foram atualizados desde a revisão.'} A lista abaixo é a que reviu. Reveja a nova lista ou prepare individualmente o que já fez no banco.</p>
        {altered&&<p>{altered.next.source.name} → {altered.next.destination.name}: de {money(altered.previous.amount)} para {money(altered.next.amount)}.</p>}
        <button ref={reviewButton} className="button" disabled={blocked} onClick={reviewAgain}>Rever nova lista</button>
      </div>}
      <section className="funding-routes" aria-label="Transferências sugeridas">
        <h3>Transferências sugeridas</h3>
        {suggestions.map(route=>{
          const repayment=reimbursements.find(row=>row.source.id===route.source.id&&row.destination.id===route.destination.id);
          const toReimburse=repayment?.suggested??0;
          return <article className="funding-route" key={JSON.stringify([route.source.id,route.destination.id])} data-testid={`route-${route.source.id}-${route.destination.id}`}>
          <div><p className="funding-direction"><strong>{route.source.name}</strong><Icon name="arrow" size={16}/><strong>{route.destination.name}</strong></p><p className="funding-amount">{money(route.amount)}</p>
            {repayment&&toReimburse>0&&<><p>Reposição de pagamentos</p><PaymentReasons reasons={repayment.reasons} limit={toReimburse}/></>}
            {route.amount>toReimburse&&<p>{money(route.amount-toReimburse)} para compromissos por realizar</p>}
          </div>
          <button className="button small" disabled={blocked||!sameMonth} onClick={()=>{onOpenChange(false);onPrepare(route.destination,route.amount,route.source,date);}}>Preparar esta transferência</button>
        </article>;})}
        {!suggestions.length&&<p>Não há transferências a sugerir entre contas à ordem.</p>}
      </section>
      {reimbursements.length>0&&<details className="funding-payment-details">
        <summary>Detalhe dos pagamentos por outra conta</summary>
        <dl>{reimbursements.map(row=><div key={JSON.stringify([row.source.id,row.destination.id])}>
          <dt>{row.source.name} → {row.destination.name}</dt><dd>{money(row.amount)} por repor</dd>
          <dd className="payment-reason-details"><PaymentReasons reasons={row.reasons}/></dd>
          {row.suggested<row.amount&&<small>{money(row.amount-row.suggested)} sem transferência sugerida</small>}
        </div>)}</dl>
        <p>As sugestões usam o excedente disponível na conta prevista depois dos seus compromissos.</p>
      </details>}
      <section className="funding-outstanding" aria-label="Valores por cobrir e por apurar">
        {remaining.filter(row=>row.amount!==null&&row.amount>0).map(row=><p className="warning" key={row.account.id} data-testid={`uncovered-${row.account.id}`}>Ainda faltam {money(row.amount)} em {row.account.name}.{row.account.archived?' Conta arquivada.':''}</p>)}
        {unassigned.length>0&&<p className="warning">Por apurar · indique a conta de {unassigned.map(l=>l.name).join(', ')} para calcular as transferências.</p>}
        {accounts.filter(row=>row.transfer===null).map(row=><p className="warning" key={row.account.id}>{row.account.name} · Por apurar. {row.current===null?'Saldo inicial por indicar. ':''}{row.required===null?'Valor por indicar no plano.':''}</p>)}
      </section>
      {suggestions.length>0&&<form className="funding-confirm" noValidate onSubmit={e=>{e.preventDefault();void record();}}>
        <p><strong>{routes.length} {routes.length===1?'transferência':'transferências'} · {money(suggested)}</strong></p>
        <p>Registe o lote depois de efetuar todas as transferências no banco. Se fez só algumas, ou se os valores ou as datas foram diferentes, prepare cada transferência individualmente.</p>
        <label>Data efetiva<input ref={dateInput} type="date" value={date} min={`${review.period}-01`} max={`${review.period}-${daysInMonth(Number(review.period.slice(0,4)),Number(review.period.slice(5)))}`} disabled={blocked} onChange={e=>{setDate(e.target.value);if(dateError)setError(null);}} aria-invalid={dateError} aria-describedby={dateError?'batch-date-error':undefined} required/>{dateError&&<span id="batch-date-error" className="inline-error" role="alert">{error.message}</span>}</label>
        <button className="button primary" disabled={blocked||stale}><Icon name="check" size={17}/>{routes.length===1?'Registar 1 transferência já efetuada':`Registar ${routes.length} transferências já efetuadas`}</button>
      </form>}
      {busy&&<p role="status">A confirmar gravação local…</p>}
      {uncertain&&<div className="callout" role="alert"><p>Resposta por confirmar. Repita o pedido original para verificar a gravação.</p><button className="button" disabled={busy} onClick={async()=>{try{await retry?.();onOpenChange(false);}catch(e){await failed(e);}}}>Repetir confirmação</button></div>}
      {error&&!stale&&!dateError&&!uncertain&&<p className="form-error" role="alert">{error.message}</p>}
    </div>
    <div className="dialog-footer"><button className="button" disabled={busy||refreshing} onClick={close}>Fechar</button></div>
  </Dialog>;
}
