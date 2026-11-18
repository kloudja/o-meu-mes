import { useState } from 'react';
import { activeEvents } from '@/domain/engine';
import type { accountFunding } from '@/domain/funding';
import type { Month, Reserve } from '@/domain/model';
import { money } from '@/domain/money';
import { sum } from '@/domain/validation';
import { Icon } from './Icon';
import { PaymentReasons } from './PaymentReasons';

type FundingReport=ReturnType<typeof accountFunding>;

interface Props {
  month: Month;
  report: FundingReport;
  reserveLabel: (reserve: Reserve) => string;
  reserveWarningText: (row: FundingReport['reserves'][number]) => string;
  onReviewTransfers: () => void;
  onOpenReserve: (id: string) => void;
}

function reimbursementStatus(row:FundingReport['reimbursements'][number],report:FundingReport){
  if(row.suggested===row.amount)return 'Reposição incluída nas sugestões.';
  if(row.suggested>0)return `${money(row.suggested)} incluídos nas sugestões; o excedente disponível não cobre os restantes ${money(row.amount-row.suggested)}.`;
  const source=report.accounts.find(item=>item.account.id===row.source.id);
  const destination=report.accounts.find(item=>item.account.id===row.destination.id);
  const reason=report.unassigned.length>0?'há compromissos sem conta indicada.'
    :row.source.archived||row.destination.archived?'uma das contas está arquivada.'
    :destination?.current===null?'o saldo da conta que pagou está por apurar.'
    :source?.surplus===null?'o excedente da conta prevista está por apurar.'
    :'a conta prevista não tem excedente disponível para esta reposição.';
  return `Sem reposição sugerida: ${reason}`;
}

export function MonthFunding({month,report,reserveLabel,reserveWarningText,onReviewTransfers,onOpenReserve}:Props){
  const [expandedCorrection,setExpandedCorrection]=useState<string|null>(null);
  const {accounts,reimbursements,reserves,unassigned}=report;
  const inScope=accounts.filter(({account,required})=>!account.archived||required!==0);
  const shortages=inScope.filter(({transfer})=>transfer!==null&&transfer>0);
  const unknown=inScope.filter(({transfer})=>transfer===null);
  const events=activeEvents(month);
  const dates=new Map(events.map(event=>[event.id,event.date]));

  return <section className="panel month-funding" aria-labelledby="month-funding-title">
    <div className="month-funding-heading">
      <h2 id="month-funding-title">O que rever neste mês</h2>
      {(shortages.length>0||unknown.length>0||reimbursements.length>0||unassigned.length>0)&&
        <button className="text-button" onClick={onReviewTransfers}>Ver transferências sugeridas em Contas<Icon name="arrow" size={16}/></button>}
    </div>

    {reimbursements.length>0?<section className="month-funding-block" aria-labelledby="month-reimbursements">
      <details className="month-reimbursements">
        <summary>
          <strong id="month-reimbursements">Pagamentos por outra conta</strong>
          <span className="funding-figure">{money(sum(reimbursements.map(row=>row.amount)))} por repor</span>
          <Icon name="chevron" size={16}/>
        </summary>
        <p>Estas despesas foram pagas com dinheiro de outra conta. Para repor, transfere-se da conta prevista para a conta que pagou. As sugestões só usam o excedente da conta prevista, depois dos seus compromissos.</p>
        <ul className="month-funding-list">
          {reimbursements.map(row=><li key={JSON.stringify([row.source.id,row.destination.id])}>
            <div className="month-funding-row">
              <h4>{row.source.name} → {row.destination.name}</h4>
              <strong className="funding-figure">{money(row.amount)} por repor</strong>
            </div>
            <PaymentReasons reasons={row.reasons} dates={dates}/>
            <p>{reimbursementStatus(row,report)}</p>
          </li>)}
        </ul>
      </details>
      <p>Estes pagamentos já estão refletidos nos saldos das contas. O valor a repor não se soma às faltas indicadas abaixo.</p>
    </section>:<div className="month-funding-block">
      <h3>Pagamentos por outra conta</h3>
      <p>{events.length?'O histórico deste mês não tem pagamentos por outra conta por repor.':'Ainda não há movimentos registados neste mês para identificar pagamentos por outra conta.'}</p>
    </div>}

    <section className="month-funding-block" aria-labelledby="month-shortages">
      <h3 id="month-shortages">Dinheiro em falta nas contas</h3>
      <p>Compara o saldo atual de cada conta com o que ainda falta pagar ou reforçar, antes das transferências sugeridas.</p>
      {shortages.length>0?<ul className="month-funding-list">
        {shortages.map(({account,current,required,transfer})=>{
          const routes=report.suggestions.filter(row=>row.destination.id===account.id);
          const expanded=expandedCorrection===account.id;
          const detailsId=`funding-correction-${account.id}`;
          const stillMissing=report.remaining.find(row=>row.account.id===account.id)?.amount;
          const incomingReimbursements=reimbursements.filter(row=>row.destination.id===account.id);
          const suggestedReimbursement=sum(incomingReimbursements.map(row=>row.suggested));
          return <li key={account.id}>
            <div className="month-funding-row month-shortage-row">
              <div>
                <h4>{account.name}{account.archived?' · Arquivada':''}</h4>
                <strong className="funding-figure">Faltam {money(transfer)}</strong>
                <p>Saldo atual: {money(current)} · Por pagar ou reforçar: {money(required)}.</p>
              </div>
              {routes.length>0&&<button type="button" className="button small" aria-expanded={expanded} aria-controls={detailsId}
                aria-label={`Corrigir falta em ${account.name}`} onClick={()=>setExpandedCorrection(expanded?null:account.id)}>Corrigir</button>}
            </div>
            {routes.length>0&&<div id={detailsId} hidden={!expanded} className="month-correction">
              <ul>{routes.map(route=><li key={route.source.id}>Transferir <strong>{money(route.amount)}</strong> de {route.source.name} para {account.name}.</li>)}</ul>
              {!!stillMissing&&<p>Após estas transferências ainda faltam {money(stillMissing)}.</p>}
            </div>}
            {incomingReimbursements.length>0&&<p>{suggestedReimbursement>0
              ?`As sugestões incluem ${money(suggestedReimbursement)} em reposições para esta conta.`
              :'Esta conta pagou despesas de outra conta. As sugestões atuais não incluem uma reposição para esta conta.'}</p>}
          </li>;
        })}
      </ul>:<p>{!inScope.length?'Sem contas à ordem para verificar.':unknown.length===inScope.length
        ?'Ainda não há dados suficientes para calcular as faltas.'
        :'Não foi detetada falta de dinheiro nas contas com saldo e compromissos conhecidos.'}</p>}
      {unassigned.length>0&&<p>Indique a conta no plano para calcular as transferências: {unassigned.map(line=>line.name).join(', ')}.</p>}
      {unknown.length>0&&<details className="month-funding-unknown">
        <summary>{unknown.length} {unknown.length===1?'conta por apurar':'contas por apurar'}</summary>
        <ul>{unknown.map(({account,current,required})=><li key={account.id}>
          <strong>{account.name}</strong> · {current===null?'Saldo inicial por indicar. ':''}{required===null?'Valor por indicar no plano.':''}
        </li>)}</ul>
      </details>}
    </section>

    {reserves.length>0&&<section className="month-funding-block" aria-labelledby="month-reserves">
      <h3 id="month-reserves">Disponibilidade nas poupanças</h3>
      <p>Estas despesas são pagas com dinheiro reservado. São verificadas à parte das contas à ordem.</p>
      <ul className="month-funding-list">{reserves.map(row=><li key={row.reserve.id}>
        <div className="month-funding-row">
          <div><h4>{reserveLabel(row.reserve)}</h4>
            <p>{reserveWarningText(row)}</p>
            {row.missing!==null&&<p>Saldo da poupança: {money(row.current)} · Despesas por pagar: {money(row.required)}.</p>}
          </div>
          <button className="text-button" onClick={()=>onOpenReserve(row.reserve.id)}>Ver Poupanças<Icon name="arrow" size={15}/></button>
        </div>
      </li>)}</ul>
    </section>}
  </section>;
}
