import { budgetRemainder, realized } from '@/domain/engine';
import { money } from '@/domain/money';
import type { Month } from '@/domain/model';
import { Icon } from './Icon';

export function BudgetRemainders({month,onOpenSavings}:{month:Month;onOpenSavings:()=>void}){
  const lines=month.lines.filter(l=>l.kind==='expense'&&l.variable);
  const remainder=budgetRemainder(month);
  return <section className="budget-remainders" aria-labelledby="budget-title">
    <header><span className="budget-icon"><Icon name="leaf" size={22}/></span><h2 id="budget-title">Sobras dos orçamentos</h2></header>
    <div className="budget-remaining">
      {lines.length>0?<><span>{remainder===null?'Sobra total':remainder<0?'Excesso total':remainder===0?'Orçamento esgotado':'Ainda por gastar no total'}</span>
        <strong className={remainder!==null&&remainder<0?'negative':undefined}>{remainder===null?'Por apurar':money(Math.abs(remainder))}</strong>
        <p>{remainder===null?'Há orçamentos com valor previsto por indicar.':'Total previsto para compras menos o total já gasto.'}</p></>:<p>Este mês ainda não tem despesas com orçamento de compras.</p>}
    </div>
    {lines.length>0&&<>
      <div className="budget-breakdown">{lines.map(l=>{
        const spent=realized(month,l.id),remaining=l.plan===null?null:l.plan-spent;
        return <div key={l.id}><details>
          <summary><span className="budget-row-name"><Icon name="chevron" size={15}/>{l.name}</span>
            <span className={remaining!==null&&remaining<0?'negative':undefined}>
              {remaining===null?'Por apurar':<><strong>{money(Math.abs(remaining))}</strong> <small>{remaining<0?'acima do previsto':remaining===0?'esgotado':'por gastar'}</small></>}
            </span>
          </summary>
          <dl><div><dt>Previsto</dt><dd>{money(l.plan)}</dd></div><div><dt>Já gasto</dt><dd>{money(spent)}</dd></div></dl>
        </details></div>;
      })}</div>
      {remainder!==null&&remainder>0&&<footer><p>Se no fim do mês houver dinheiro disponível no banco, pode reforçar o Fundo de Emergência.</p>
        <button className="text-button" onClick={onOpenSavings}>Ver poupanças<Icon name="arrow" size={16}/></button>
      </footer>}
    </>}
  </section>;
}
