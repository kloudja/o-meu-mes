import { completed, linkableExpenses, occurrenceLineId, realized } from '@/domain/engine';
import { dateLabel, money, monthLabel } from '@/domain/money';
import type { Month, Occurrence, State } from '@/domain/model';

export function RecurringPayments({state,month,disabled,onEdit,onLink,onResolve,onView}:{
  state:State;month:Month;disabled:boolean;onEdit:(id?:string)=>void;onLink:(id:string)=>void;
  onResolve:(id:string,mode:'add'|'dismiss')=>void;onView:(id:string)=>void;
}){
  const openCount=month.occurrences.filter(o=>o.state==='open').length;
  const expenses=linkableExpenses(month);
  const canLink=expenses.length>0;
  const normalName=(name:string)=>name.trim().toLocaleLowerCase('pt-PT');
  const occurrences=[...month.occurrences].sort((a,b)=>a.date.localeCompare(b.date));
  function funding(item:{accountId:string;reserveId?:string}){
    const account=state.accounts.find(a=>a.id===item.accountId);
    const reserve=state.reserves.find(r=>r.id===item.reserveId);
    return <span>{account?.name??'Conta por indicar'}{reserve&&<> · Reserva {reserve.name}</>}</span>;
  }
  function reminder(o:Occurrence){
    const line=month.lines.find(l=>l.id===o.lineId);
    const candidates=o.state==='open'?expenses.filter(l=>normalName(l.name)===normalName(o.name)):[];
    const hasCandidate=candidates.length>0;
    return <article className="recurring-row" key={o.id} data-testid={`occ-${o.definitionId}`}>
      <div className="recurring-info">
        <h3>{o.name}</h3>
        <p className="recurring-meta"><time dateTime={o.date}>{dateLabel(o.date)}</time><strong>{money(o.amount)}</strong></p>
        <p>{funding(o)}</p>
        <span className="status">{o.state==='open'?'Por rever':o.state==='dismissed'?'Dispensado neste mês':o.lineId===occurrenceLineId(o.id)?'Adicionado ao plano':`Associado a ${line?.name??'movimento removido'}`}{line&&completed(month,line.id)&&' · Concluído no plano'}</span>
        {hasCandidate&&<div className="reminder-candidates">
          <p><strong>Possível correspondência no plano</strong> · O nome coincide. Confirme se é a mesma despesa.</p>
          <ul>{candidates.map(l=><li key={l.id}><strong>{l.name}</strong> · {funding(l)} · {money(l.plan)} previstos · {money(realized(month,l.id))} registados</li>)}</ul>
        </div>}
      </div>
      {o.state==='open'?<div className="recurring-actions">
        {hasCandidate&&<button className="button small primary-soft" disabled={disabled} onClick={()=>onLink(o.id)}>Associar a movimento existente</button>}
        <button className={hasCandidate?'button small':'button small primary-soft'} disabled={disabled} onClick={()=>onResolve(o.id,'add')}>{hasCandidate?'Criar despesa separada':'Adicionar ao plano'}</button>
        {canLink&&!hasCandidate&&<button className="text-button" disabled={disabled} onClick={()=>onLink(o.id)}>Associar a movimento existente</button>}
        <button className="text-button muted" disabled={disabled} onClick={()=>onResolve(o.id,'dismiss')}>Dispensar neste mês</button>
      </div>:line&&<button className="button small" disabled={disabled} onClick={()=>onView(line.id)}>Ver no plano</button>}
    </article>;
  }
  return <>
    <div className="section-links"><a href="#lembretes">Lembretes <span>{openCount} por rever</span></a><a href="#definicoes-recorrentes">Definições habituais</a></div>
    <section className="panel monthly-section" id="lembretes" aria-labelledby="reminders-title">
      <div className="section-top"><h2 id="reminders-title">Lembretes de {monthLabel(month.period)}</h2></div>
      <p className="panel-intro">{canLink?'Se a despesa já estiver no plano, associe-a. ':openCount>0?'Pode associar um lembrete quando houver uma despesa disponível no plano. ':''}Adicionar cria uma despesa por pagar. O saldo só muda quando registar o pagamento.</p>
      {occurrences.length===0&&<div className="empty"><h3>Sem lembretes neste mês</h3><p>As definições ativas geram lembretes quando abre um mês novo.</p><a className="text-button" href="#definicoes-recorrentes">Ver definições habituais</a></div>}
      {occurrences.map(reminder)}
    </section>
    <section className="panel spaced monthly-section" id="definicoes-recorrentes" aria-labelledby="recurring-definitions-title">
      <div className="section-top recurring-definitions-head"><h2 id="recurring-definitions-title">Definições habituais</h2>
        <button className="button small primary" disabled={disabled} onClick={()=>onEdit()}>Novo recorrente</button>
      </div>
      <p className="panel-intro">As despesas recorrentes aparecem nos meses que abrir a partir daqui. Pode também escrever um lembrete para aparecer no painel antes do pagamento.</p>
      {state.recurring.length===0&&<div className="empty"><h3>Ainda sem pagamentos recorrentes</h3><p>Crie uma definição mensal ou anual para receber lembretes nos meses novos.</p></div>}
      {state.recurring.map(r=><article className="definition-row" key={r.id}>
        <div className="recurring-info"><h3>{r.name}</h3>
          <p className="recurring-meta"><span>{r.frequency==='monthly'?'Mensal':'Anual'} · {dateLabel(r.date)}</span><strong>{money(r.amount)}</strong></p>
          <p>{funding(r)}</p><span className="status">{r.active?'Ativo':'Inativo'}</span>
          {r.reminderText&&<p><strong>{r.reminderText}</strong> · {r.reminderDays===0?'No dia do pagamento':r.reminderDays===1?'1 dia antes':`${r.reminderDays} dias antes`}</p>}
        </div>
        <button className="button small" disabled={disabled} onClick={()=>onEdit(r.id)}>Editar</button>
      </article>)}
      <details className="calendar-rule"><summary>Como são calculadas as datas</summary><p>Se o dia 29, 30 ou 31 não existir no mês, o lembrete fica no último dia. Um pagamento anual de 29 de fevereiro fica a 28 nos anos comuns.</p></details>
    </section>
  </>;
}
