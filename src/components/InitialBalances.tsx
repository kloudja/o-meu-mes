import { inputMoney, money, monthLabel } from '@/domain/money';

interface MissingBalance { id:string; name:string; suggestion?:{period:string;amount:number}|null }

export function InitialBalances({sources,values,onChange,errorSource,error}:{
  sources:MissingBalance[];
  values:Record<string,string>;
  onChange:(source:string,value:string)=>void;
  errorSource:string;
  error:string;
}){
  if(!sources.length)return null;
  return <fieldset className="initial-balances">
    <legend>Falta indicar o saldo no início deste mês</legend>
    <p>Para calcular o resultado, indique quanto já existia antes dos movimentos deste mês. Estes valores são separados do montante que vai registar agora.</p>
    {sources.map((source,index)=><div key={source.id}>
      <label>Saldo inicial — {source.name} (€)
        <input autoFocus={index===0} inputMode="decimal" name={`initial-${source.id}`} value={values[`initial:${source.id}`]??''}
          placeholder="Por indicar" required onChange={e=>onChange(source.id,e.target.value)}
          aria-invalid={errorSource===source.id} aria-describedby={`hint-${source.id}${errorSource===source.id?' form-error':''}`}/>
      </label>
      <small id={`hint-${source.id}`}>{source.id.startsWith('r:')?'Se esta reserva começou vazia, indique 0,00 €. Não inclua o reforço de agora.':'Indique apenas o saldo da conta principal, sem somar as reservas.'}</small>
      {source.suggestion&&<p><button className="text-button" type="button" onClick={()=>onChange(source.id,inputMoney(source.suggestion!.amount))}>
        Usar sugestão de {monthLabel(source.suggestion.period)} · {money(source.suggestion.amount)}
      </button><br/><small>Confirme o valor que vê no banco antes de guardar.</small></p>}
      {errorSource===source.id&&<p id="form-error" className="inline-error" role="alert">{error}</p>}
    </div>)}
    <p>Só será aplicado ao confirmar a operação. Cancelar não altera saldos.</p>
  </fieldset>;
}
