import { budgetRemainders } from '@/domain/engine';
import { money } from '@/domain/money';
import type { Month } from '@/domain/model';
import { subtotal } from '@/domain/validation';
import { Icon } from './Icon';

export function BudgetRemainders({month,onOpenSavings}:{month:Month;onOpenSavings:()=>void}){
  const rows=budgetRemainders(month);
  const {amount:remainder,missing}=subtotal(rows.map(row=>row.remaining));
  const partial=remainder!==null&&missing>0;
  return <section className="budget-remainders" aria-labelledby="budget-title">
    <header><span className="budget-icon"><Icon name="leaf" size={22}/></span><h2 id="budget-title">Sobras dos orçamentos</h2></header>
    <div className="budget-remaining">
      {rows.length>0?<><span>{partial?'Saldo dos orçamentos apurados':remainder===null?'Sobra total':remainder<0?'Excesso total':remainder===0?'Orçamento esgotado':'Ainda por gastar no total'}</span>
        <div className="subtotal-amount"><strong className={remainder!==null&&remainder<0?'negative':undefined}>{remainder===null?'Por apurar':money(partial?remainder:Math.abs(remainder))}</strong>
          {partial&&<span className="subtotal-tag">Ainda há valores por apurar</span>}
        </div>
        <p>{missing?'Há orçamentos com valor previsto por indicar.':'Total previsto para compras menos o total já gasto.'}</p></>:<p>Este mês ainda não tem despesas com orçamento de compras.</p>}
    </div>
    {rows.length>0&&<>
      <div className="budget-breakdown">{rows.map(({line:l,spent,remaining})=><div key={l.id}><details>
          <summary><span className="budget-row-name"><Icon name="chevron" size={15}/>{l.name}</span>
            <span className={remaining!==null&&remaining<0?'negative':undefined}>
              {remaining===null?'Por apurar':<><strong>{money(Math.abs(remaining))}</strong> <small>{remaining<0?'acima do previsto':remaining===0?'esgotado':'por gastar'}</small></>}
            </span>
          </summary>
          <dl><div><dt>Previsto</dt><dd>{money(l.plan)}</dd></div><div><dt>Já gasto</dt><dd>{money(spent)}</dd></div></dl>
        </details></div>)}</div>
      {!missing&&remainder!==null&&remainder>0&&<footer><p>Se no fim do mês houver dinheiro disponível no banco, pode reforçar o Fundo de Emergência.</p>
        <button className="text-button" onClick={onOpenSavings}>Ver poupanças<Icon name="arrow" size={16}/></button>
      </footer>}
    </>}
  </section>;
}
