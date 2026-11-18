import { inputMoney, money, monthLabel } from '@/modules/finance/domain/money';
import { MoneyInput } from './MoneyInput';

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
    <legend>{sources.some(source=>!source.id.startsWith('r:'))?'Saldos a indicar para o registo':'Total acumulado da poupança (opcional)'}</legend>
    {sources.map((source,index)=>{
      const reserve=source.id.startsWith('r:');
      const label=`${reserve?'Total acumulado antes deste registo':'Saldo inicial'} — ${source.name} (€)`;
      return <div key={source.id}>
      <label>{label}
        <MoneyInput autoFocus={index===0&&!reserve} name={`initial-${source.id}`} aria-label={label} value={values[`initial:${source.id}`]??''}
          placeholder={reserve?inputMoney(source.suggestion?.amount??0):'Por indicar'} required={!reserve} onValue={value=>onChange(source.id,value)}
          aria-invalid={errorSource===source.id} aria-describedby={`hint-${source.id}${errorSource===source.id?' form-error':''}`}/>
      </label>
      <small id={`hint-${source.id}`}>{reserve?`Indique todo o dinheiro que já está nesta poupança antes deste movimento. Em branco, é usado ${money(source.suggestion?.amount??0)}${source.suggestion?` de ${monthLabel(source.suggestion.period)}`:''}.`:'Indique o saldo da conta antes dos movimentos deste mês, sem somar as poupanças.'}</small>
      {source.suggestion&&<p><button className="text-button" type="button" onClick={()=>onChange(source.id,inputMoney(source.suggestion!.amount))}>
        Usar sugestão de {monthLabel(source.suggestion.period)} · {money(source.suggestion.amount)}
      </button><br/><small>Confirme o valor que vê no banco antes de guardar.</small></p>}
      {errorSource===source.id&&<p id="form-error" className="inline-error" role="alert">{error}</p>}
    </div>;})}
    <p>Só será aplicado ao confirmar a operação. Cancelar não altera saldos.</p>
  </fieldset>;
}
