import { describe, expect, it } from 'vitest';
import { examples } from '../../src/data/fixtures';
import { activeEvents, balance, budgetRemainder, completed, dueDate, initialPlan, obligations, pending, realized, savingPending, sourceTotals, summary, totalUnallocated, transact, DomainError, type Action, type FinancialAction } from '../../src/domain/engine';
import { aid, rid, type State } from '../../src/domain/model';
import { monthLabel, parseMoney } from '../../src/domain/money';
import { sum } from '../../src/domain/validation';
const A=aid('act-r'), B=aid('act-s'), M=aid('moey-r'), R=rid('em');
const month=(s:State)=>s.months[s.selected];
let sequence=0;
const act=(s:State,a:Action,key=`accept-${++sequence}`)=>transact(s,a,key);
const pay=(lineId='food',amount=4000,source=A,extra:Partial<Extract<FinancialAction,{type:'execute'}>>={}):Extract<FinancialAction,{type:'execute'}>=>({type:'execute',lineId,amount,source,date:'2026-11-02',complete:false,...extra});
const total=(n:number,source=A)=>pay('food',n,source,{total:true});
const transfer=(source=A,destination=B,amount=5000):FinancialAction=>({type:'transfer',source,destination,amount,date:'2026-11-02'});
const reconcile=(amount=5500,source=A):FinancialAction=>({type:'reconcile',source,amount,date:'2026-11-02',note:'Conferência sintética'});
function rejected(s:State,a:Action,code?:string,key?:string){
  const before=structuredClone(s);
  let error:unknown;try{act(s,a,key);}catch(e){error=e;}
  expect(error).toBeInstanceOf(DomainError);if(code)expect((error as DomainError).code).toBe(code);
  expect(s).toEqual(before);
}
function small(){const s=examples();month(s).initials[A]=10000;return s;}

describe('Correções e anulações — resultados independentes',()=>{
  it('pagamento corrigido muda origem e montante sem alterar a referência ou contar duas vezes',()=>{
    let s=act(examples(),pay('services',4000),'payment');s=act(s,{type:'correct',id:'payment',replacement:pay('services',2500,B)});
    expect(balance(month(s),A)).toBe(95000);expect(balance(month(s),B)).toBe(22500);expect(realized(month(s),'services')).toBe(2500);
    expect(month(s).events[0].voided).toBe(true);expect(month(s).events[1].corrects).toBe('payment');
    s=act(s,{type:'void',id:month(s).events[1].id});expect(balance(month(s),B)).toBe(25000);expect(realized(month(s),'services')).toBe(0);
  });
  it('recebimento corrigido 100 para 60 noutra conta e anulado',()=>{
    let s=act(examples(),pay('income',10000),'receipt');s=act(s,{type:'correct',id:'receipt',replacement:pay('income',6000,B)});
    expect(balance(month(s),A)).toBe(95000);expect(balance(month(s),B)).toBe(31000);expect(realized(month(s),'income')).toBe(6000);
    s=act(s,{type:'void',id:month(s).events[1].id});expect(balance(month(s),B)).toBe(25000);
  });
  it('anulação de recebimento gasto rejeitada, correção suficiente é atómica',()=>{
    let s=small();month(s).initials[A]=0;s=act(s,pay('income',10000),'receipt');s=act(s,pay('services',4000));
    rejected(s,{type:'void',id:'receipt'},'DEPENDENCY');
    rejected(s,{type:'correct',id:'receipt',replacement:pay('income',3000)},'DEPENDENCY');
    s=act(s,{type:'correct',id:'receipt',replacement:pay('income',6000)});expect(balance(month(s),A)).toBe(2000);
  });
  it('reforço 100, uso 40: anulação inválida; corrigir reforço para 80 e depois anular na ordem válida',()=>{
    let s=examples();month(s).initials[R]=0;s=act(s,pay('save-em',10000,M),'fund');s=act(s,pay('health',4000,R),'use');
    expect(balance(month(s),M)).toBe(90000);expect(balance(month(s),R)).toBe(6000);
    rejected(s,{type:'void',id:'fund'},'DEPENDENCY');
    s=act(s,{type:'correct',id:'fund',replacement:pay('save-em',8000,M)},'correct-fund');
    expect(balance(month(s),M)).toBe(92000);expect(balance(month(s),R)).toBe(4000);expect(realized(month(s),'health')).toBe(4000);
    s=act(s,{type:'void',id:'use'});s=act(s,{type:'void',id:'correct-fund'});
    expect(balance(month(s),M)).toBe(100000);expect(balance(month(s),R)).toBe(0);
  });
  it('transferência corrigida e anulada reverte as duas origens',()=>{
    let s=act(examples(),transfer(),'transfer');s=act(s,{type:'correct',id:'transfer',replacement:transfer(A,M,3000)},'correction');
    expect(balance(month(s),A)).toBe(92000);expect(balance(month(s),B)).toBe(25000);expect(balance(month(s),M)).toBe(103000);
    s=act(s,{type:'void',id:'correction'});expect(balance(month(s),A)).toBe(95000);expect(balance(month(s),M)).toBe(100000);
  });
  it('transferência já utilizada não pode ser anulada sem resolver dependências',()=>{
    let s=examples();month(s).initials[B]=0;s=act(s,transfer(),'transfer');s=act(s,pay('mimos',4000,B));
    rejected(s,{type:'void',id:'transfer'},'DEPENDENCY');
  });
  it('devolução da reserva ao principal é distinta da despesa e anulável',()=>{
    let s=act(examples(),transfer(R,M,5000),'return');expect(balance(month(s),R)).toBe(25000);expect(balance(month(s),M)).toBe(105000);expect(realized(month(s),'health')).toBe(0);
    s=act(s,{type:'void',id:'return'});expect(balance(month(s),R)).toBe(30000);expect(balance(month(s),M)).toBe(100000);
  });
  it('100 - 40, conferência 55 = -5; corrigir para 58 = -2; anular = 60',()=>{
    let s=act(small(),pay('services',4000));s=act(s,reconcile(),'adjustment');s=act(s,reconcile(),'adjustment');
    expect(balance(month(s),A)).toBe(5500);expect(month(s).events[1].deltas[A]).toBe(-500);
    s=act(s,{type:'correct',id:'adjustment',replacement:reconcile(5800)},'correct-adjustment');
    expect(balance(month(s),A)).toBe(5800);expect(month(s).events[2].deltas[A]).toBe(-200);expect(month(s).initials[A]).toBe(10000);
    s=act(s,{type:'void',id:'correct-adjustment'});expect(balance(month(s),A)).toBe(6000);
  });
  it('conferência positiva já consumida não pode ser anulada',()=>{
    let s=small();month(s).initials[A]=0;s=act(s,reconcile(10000),'adj');s=act(s,pay('services',4000));rejected(s,{type:'void',id:'adj'},'DEPENDENCY');
  });
  it('correção inválida e mudança de natureza/linha preservam tudo',()=>{
    const s=act(examples(),pay('services',4000),'payment');
    rejected(s,{type:'correct',id:'payment',replacement:pay('rent',1000)},'CORRECTION');
    rejected(s,{type:'correct',id:'payment',replacement:transfer()},'CORRECTION');
    rejected(s,{type:'correct',id:'payment',replacement:pay('services',1000,'a:missing')},'SOURCE');
    rejected(s,{type:'void',id:'missing'},'EVENT');
  });
});

describe('Compras, observações acumuladas e financiamento',()=>{
  it('40 + ajuste 20 + compra nova 10 = 70; repetição não cria gasto; redução válida para 60',()=>{
    let s=act(examples(),pay());s=act(s,total(6000),'total');s=act(s,pay('food',1000));
    expect(realized(month(s),'food')).toBe(7000);expect(balance(month(s),A)).toBe(88000);
    s=act(s,total(7000));expect(month(s).events).toHaveLength(3);
    s=act(s,total(6000),'reduce');expect(realized(month(s),'food')).toBe(6000);expect(balance(month(s),A)).toBe(89000);expect(month(s).events[3].amount).toBe(-1000);
    rejected(s,total(4900),'TOTAL_BELOW_PURCHASES');
    rejected(s,{type:'void',id:'total'},'DEPENDENCY');
    s=act(s,{type:'void',id:'reduce'});s=act(s,{type:'void',id:'total'});expect(realized(month(s),'food')).toBe(5000);expect(balance(month(s),A)).toBe(90000);
  });
  it('duas origens: redução só devolve ao financiador do ajuste',()=>{
    let s=act(examples(),pay());s=act(s,total(6000,B),'total-b');
    rejected(s,total(5000,A),'TOTAL_SOURCE');
    s=act(s,total(5000,B),'reduce-b');expect(balance(month(s),A)).toBe(91000);expect(balance(month(s),B)).toBe(24000);expect(realized(month(s),'food')).toBe(5000);
    s=act(s,total(8000,A),'total-a');expect(balance(month(s),A)).toBe(88000);
    s=act(s,total(6000,A));expect(balance(month(s),A)).toBe(90000);expect(balance(month(s),B)).toBe(24000);
    rejected(s,total(4000,A),'TOTAL_SOURCE');
  });
  it('correção de total muda conta e montante sem criar crédito na conta errada',()=>{
    let s=act(examples(),pay());s=act(s,total(6000,B),'total-b');
    s=act(s,{type:'correct',id:'total-b',replacement:total(6500,A)},'correct-total');
    expect(realized(month(s),'food')).toBe(6500);expect(balance(month(s),A)).toBe(88500);expect(balance(month(s),B)).toBe(25000);
    s=act(s,{type:'void',id:'correct-total'});expect(realized(month(s),'food')).toBe(4000);expect(balance(month(s),A)).toBe(91000);
  });
  it('corrigir redução mantém coerência das parcelas e origens',()=>{
    let s=act(examples(),pay());s=act(s,total(8000),'t');s=act(s,total(6000),'reduce');
    s=act(s,{type:'correct',id:'reduce',replacement:total(7000)},'correct-reduce');
    expect(realized(month(s),'food')).toBe(7000);expect(balance(month(s),A)).toBe(88000);expect(totalUnallocated(month(s),month(s).events[1])).toBe(3000);
  });
  it('detalhe de compra já incluída consome ajuste, não despesa nem saldo adicionais',()=>{
    let s=act(examples(),pay());s=act(s,total(6000),'t');s=act(s,pay('food',1000,A,{includedInTotal:'t',description:'Mercearia'}),'detail');
    expect(realized(month(s),'food')).toBe(6000);expect(balance(month(s),A)).toBe(89000);expect(month(s).events[2].purchaseAmount).toBe(1000);expect(month(s).events[2].deltas).toEqual({[A]:0});
    expect(totalUnallocated(month(s),month(s).events[1])).toBe(1000);
    rejected(s,{type:'void',id:'t'},'DEPENDENCY');rejected(s,total(4900),'TOTAL_BELOW_PURCHASES');
    s=act(s,total(5000));expect(realized(month(s),'food')).toBe(5000);expect(balance(month(s),A)).toBe(90000);
    s=act(s,pay('food',1000));expect(realized(month(s),'food')).toBe(6000);
  });
  it('detalhe rejeita origem errada e excesso; correção/anulação só altera a parcela detalhada',()=>{
    let s=act(examples(),total(6000),'t');
    rejected(s,pay('food',1000,B,{includedInTotal:'t'}),'DETAIL');rejected(s,pay('food',6100,A,{includedInTotal:'t'}),'DETAIL');
    s=act(s,pay('food',4000,A,{includedInTotal:'t'}),'detail');
    s=act(s,{type:'correct',id:'detail',replacement:pay('food',3000,A,{includedInTotal:'t'})},'detail-correct');
    expect(realized(month(s),'food')).toBe(6000);expect(totalUnallocated(month(s),month(s).events[0])).toBe(3000);
    s=act(s,{type:'void',id:'detail-correct'});expect(totalUnallocated(month(s),month(s).events[0])).toBe(6000);expect(balance(month(s),A)).toBe(89000);
  });
  it('corrigir compra após total não muda silenciosamente a observação nem o financiador',()=>{
    let s=act(examples(),pay(),'purchase');s=act(s,total(6000,B));
    s=act(s,{type:'correct',id:'purchase',replacement:pay('food',3000,A)});
    expect(realized(month(s),'food')).toBe(5000);expect(balance(month(s),A)).toBe(92000);expect(balance(month(s),B)).toBe(23000);
  });
});

describe('Referências, desconhecidos e isolamento',()=>{
  it('100 inicial, 120 atual, 40 realizado; nomes, arquivo e remoção preservam snapshot e eventos',()=>{
    let s=act(examples(),{type:'snapshot',date:'2026-11-02'});
    s=act(s,{type:'line',line:{...month(s).lines[1],name:'Serviços renomeados',plan:12000}});s=act(s,pay('services',4000),'pay');
    s=act(s,{type:'account',account:{...s.accounts[0],name:'Conta renomeada',archived:true}});s=act(s,{type:'category',category:{...s.categories[1],name:'Categoria renomeada',archived:true}});
    expect(initialPlan(month(s),month(s).lines[1])).toBe(10000);expect(pending(month(s),month(s).lines[1])).toBe(8000);
    expect(month(s).snapshot!.catalog.accounts[0].name).toBe('ActivoBank A');expect(month(s).snapshot!.lines[1].name).toBe('Serviços Essenciais');expect(month(s).events[0].sourceNames![A]).toBe('ActivoBank A');
    rejected(s,{type:'removeLine',id:'services'},'HISTORY');s=act(s,{type:'void',id:'pay'});s=act(s,{type:'removeLine',id:'services'});
    expect(month(s).snapshot!.lines[1].plan).toBe(10000);expect(month(s).removedLines!.find(l=>l.id==='services')!.plan).toBe(12000);expect(month(s).events).toHaveLength(1);
    rejected(s,{type:'line',line:{...month(s).removedLines![0]}},'ACCOUNT');
  });
  it('novo ID após snapshot é zero; desconhecido inicial continua null',()=>{
    let s=examples();month(s).lines[0].plan=null;s=act(s,{type:'snapshot',date:'2026-11-02'});s=act(s,{type:'line',line:{...month(s).lines[0],plan:10000}});
    expect(initialPlan(month(s),month(s).lines[0])).toBeNull();s=act(s,{type:'line',line:{...month(s).lines[0],id:'new-line',plan:3000}});expect(initialPlan(month(s),month(s).lines.at(-1)!)).toBe(0);
  });
  it('somas desconhecidas não se tornam zero; conclusão explícita resolve compromisso, não orçamento',()=>{
    let s=examples();month(s).lines.find(l=>l.id==='food')!.plan=null;
    expect(obligations(month(s),A)).toBeNull();expect(summary(s,month(s)).expenses).toBeNull();expect(summary(s,month(s)).free).toBeNull();expect(budgetRemainder(month(s))).toBeNull();
    s=act(s,pay('food',1000,A,{complete:true}));expect(pending(month(s),month(s).lines.find(l=>l.id==='food')!)).toBe(0);expect(budgetRemainder(month(s))).toBeNull();expect(summary(s,month(s)).expenses).toBe(50500);
    month(s).lines.find(l=>l.id==='save-em')!.plan=null;expect(savingPending(month(s),'em')).toBeNull();expect(summary(s,month(s)).savings).toBeNull();
  });
  it('50 de sobra - 10 de excesso = 40; conclusão por menos preserva sobra e saldo do fundo',()=>{
    let s=examples();month(s).lines=month(s).lines.filter(l=>['food','mimos'].includes(l.id));s=act(s,pay('food',15000,A,{complete:true}));s=act(s,pay('mimos',6000,B,{complete:true}));
    expect(budgetRemainder(month(s))).toBe(4000);expect(obligations(month(s),A)).toBe(0);expect(obligations(month(s),B)).toBe(0);expect(balance(month(s),R)).toBe(30000);
    s=act(s,{type:'line',line:{...month(s).lines[0],plan:10000}});expect(budgetRemainder(month(s))).toBe(-6000);
  });
  it('mês novo não copia nada; base alterada e catálogos arquivados não mudam mês anterior',()=>{
    let s=act(examples(),pay());s=act(s,{type:'snapshot',date:'2026-11-02'});const before=structuredClone(month(s));
    s=act(s,{type:'line',target:'base',line:{...s.base[0],plan:12345}});s=act(s,{type:'account',account:{...s.accounts[0],archived:true}});s=act(s,{type:'month',period:'2026-12'});
    expect(month(s).lines[0].plan).toBe(12345);expect(month(s).snapshot).toBeUndefined();expect(month(s).events).toEqual([]);expect(Object.values(month(s).initials).every(v=>v===null)).toBe(true);expect(s.months['2026-11']).toEqual(before);
    s=act(s,{type:'month',period:'2026-11'});expect(month(s)).toEqual(before);
  });
  it('arquivo preserva referências existentes mas impede novas seleções; objeto de comando não fica ligado ao estado',()=>{
    let s=act(examples(),{type:'account',account:{...examples().accounts[0],archived:true}});
    const original=month(s).lines[0];s=act(s,{type:'line',line:{...original,plan:9000}});
    rejected(s,{type:'line',line:{...original,id:'new'}},'ACCOUNT');
    const line={...month(s).lines[1],plan:12300};s=act(s,{type:'line',line});line.plan=999;
    expect(month(s).lines[1].plan).toBe(12300);
  });
  it('remover ID inexistente não remove a última linha; ID removido não é reutilizado',()=>{
    let s=examples();rejected(s,{type:'removeLine',id:'missing'},'LINE');rejected(s,{type:'removeLine',id:'missing',target:'base'},'LINE');
    const l=month(s).lines[0];s=act(s,{type:'removeLine',id:l.id});rejected(s,{type:'line',line:l},'ID');
  });
  it('edição do plano não muda a natureza/destino do histórico, mesmo anulado',()=>{
    let s=act(examples(),pay('save-em',10000,M),'saving');const l=month(s).lines.find(l=>l.id==='save-em')!;
    rejected(s,{type:'line',line:{...l,reserveId:'car'}},'HISTORY');s=act(s,{type:'void',id:'saving'});rejected(s,{type:'line',line:{...l,kind:'expense'}},'HISTORY');
    const expense=act(examples(),pay()),food=month(expense).lines.find(l=>l.id==='food')!;
    const updated=act(expense,{type:'line',line:{...food,variable:false}});
    expect(month(updated).events).toEqual(month(expense).events);
    expect(realized(month(updated),food.id)).toBe(realized(month(expense),food.id));
  });
});

describe('Idempotência, confirmação conjunta e validação direta',()=>{
  it('mesma chave/conteúdo não repete; conteúdo diferente é rejeitado; objetos reordenados são iguais',()=>{
    let s=act(examples(),pay(),'same');const before=s;s=act(s,{date:'2026-11-02',source:A,lineId:'food',complete:false,amount:4000,type:'execute'},'same');expect(s).toBe(before);
    rejected(s,pay('food',5000),'IDEMPOTENCY','same');expect(month(s).events).toHaveLength(1);
  });
  it('falha não consome chave e registo depois de anular é legítimo',()=>{
    let s=small();rejected(s,pay('food',11000),'FUNDS','retry');s=act(s,pay('food',4000),'retry');s=act(s,{type:'void',id:'retry'});s=act(s,pay('food',4000),'new');expect(balance(month(s),A)).toBe(6000);expect(activeEvents(month(s))).toHaveLength(1);
  });
  it('mesma chave em meses distintos não impede operações legítimas',()=>{
    let s=act(examples(),pay(),'key');s=act(s,{type:'month',period:'2026-12'});s=act(s,pay('food',1000,A,{date:'2026-12-02',initials:{[A]:10000}}),'key');expect(realized(month(s),'food')).toBe(1000);expect(realized(s.months['2026-11'],'food')).toBe(4000);
  });
  it('iniciais + reforço: cancelar não envia comando; falhas deixam todos os campos intactos',()=>{
    let s=act(examples(),{type:'month',period:'2026-12'});const before=structuredClone(s);
    const draft=pay('save-em',10000,M,{date:'2026-12-02',initials:{[M]:100000,[R]:0}});expect(s).toEqual(before);
    rejected(s,{...draft,initials:{[M]:5000,[R]:0}},'FUNDS','joint');rejected(s,{...draft,source:'a:missing'},'SOURCE','joint');
    s=act(s,draft,'joint');expect(balance(month(s),M)).toBe(90000);expect(balance(month(s),R)).toBe(10000);
    rejected(s,{...draft,amount:1000},'INITIAL_EXISTS');
  });
  it('recebimento sem inicial mantém desconhecido e exige inicial explícito',()=>{
    const s=act(examples(),{type:'month',period:'2026-12'});rejected(s,pay('income',10000,A,{date:'2026-12-02'}),'INITIAL');
    const next=act(s,pay('income',10000,A,{date:'2026-12-02',initials:{[A]:0}}));expect(balance(month(next),A)).toBe(10000);expect(balance(month(s),A)).toBeNull();
  });
  it.each([-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('rejeita montante inválido %s no domínio',n=>{rejected(examples(),pay('food',n));});
  it.each(['2026-11-00','2026-11-31','2026-12-01','2026-2-02','0000-11-02'])('rejeita data %s sem efeitos',date=>{rejected(examples(),pay('food',1000,A,{date}),'DATE');});
  it.each(['2026-00','2026-13','0000-01','26-11','2026-1'])('rejeita período %s',period=>{rejected(examples(),{type:'month',period},'PERIOD');});
  it('valida snapshot, recorrente, catálogo, iniciais, IDs e relações sem depender de formulários',()=>{
    const s=examples();rejected(s,{type:'snapshot',date:'2026-02-29'},'DATE');rejected(s,{type:'initial',source:'a:unknown',amount:0},'SOURCE');
    rejected(s,{type:'line',line:{...s.base[0],id:'',plan:100}},'ID');rejected(s,{type:'line',line:{...s.base[0],categoryId:'no-category'}},'CATEGORY');
    rejected(s,{type:'line',line:{...s.base[0],accountId:'no-account'}},'ACCOUNT');rejected(s,{type:'line',line:{...s.base[0],reserveId:'em'}},'RESERVE');
    rejected(s,{type:'recurring',definition:{...s.recurring[0],date:'2026-02-29'}},'DATE');rejected(s,{type:'category',category:{id:'new',name:' '}},'NAME');
    rejected(s,{type:'account',account:{...s.accounts[0],restricted:true}},'HISTORY');rejected(s,pay('no-line'), 'LINE');
  });
  it('origem/destino iguais, desconhecidos ou incompatíveis rejeitam sem aplicar iniciais',()=>{
    const s=examples();rejected(s,transfer(A,A),'DESTINATION');rejected(s,transfer(A,'a:unknown'),'DESTINATION');rejected(s,transfer(A,R),'DESTINATION');rejected(s,transfer(R,rid('car')),'DESTINATION');rejected(s,pay('income',1000,R),'SOURCE');
    rejected(s,{type:'transfer',source:A,destination:B,amount:1000,date:'2026-11-02',initials:{[rid('gas')]:0}},'INITIAL_SCOPE');
  });
  it('origem restrita é fixture de teste isolada, nunca compensa dinheiro livre',()=>{
    const s=examples();expect(s.accounts.some(a=>a.name==='Cartão Refeição')).toBe(false);s.accounts.push({id:'restricted',name:'Teste restrito',color:'#999999',restricted:true});month(s).initials['a:restricted']=100000;
    expect(summary(s,month(s)).available).toBe(250000);rejected(s,pay('food',1000,'a:restricted'),'RESTRICTED');rejected(s,transfer(A,'a:restricted'),'DESTINATION');rejected(s,pay('insurance',15000,aid('san')),'FUNDS');
  });
  it('parsing e somas exatas até ao limite seguro; overflow não publica estado',()=>{
    expect(parseMoney('0,10')).toBe(10);expect(parseMoney('1.234,56')).toBe(123456);expect(parseMoney('90.071.992.547.409,91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(()=>parseMoney('90.071.992.547.409,92')).toThrow();expect(()=>parseMoney('1,001')).toThrow();expect(sum([Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER,1])).toBe(1);
    const s=examples();rejected(s,{type:'initial',source:aid('bank'),amount:Number.MAX_SAFE_INTEGER},'MONEY_LIMIT');
    rejected(s,pay('income',Number.MAX_SAFE_INTEGER),'MONEY_LIMIT');
  });
});

describe('Invariantes e lembretes existentes',()=>{
  it.each([1,10,999,5000])('transferência/reforço conservam património; despesa %i reduz uma única vez',n=>{
    const original=examples();const start=sourceTotals(original,month(original)).wealth;expect(start).toBe(280000);
    let s=act(original,transfer(A,B,n));expect(sourceTotals(s,month(s)).wealth).toBe(280000);
    s=act(s,pay('save-em',n,M));expect(sourceTotals(s,month(s)).wealth).toBe(280000);
    s=act(s,pay('health',n,R));expect(sourceTotals(s,month(s)).wealth).toBe(280000-n);expect(balance(month(s),M)).toBe(100000-n);
  });
  it('datas 29/30/31 e ano secular; consultar futuro não modifica definições',()=>{
    const r=examples().recurring[0],before=structuredClone(r);
    expect(dueDate({...r,date:'2026-01-31'},'2026-04')).toBe('2026-04-30');expect(dueDate({...r,date:'2024-02-29',frequency:'annual'},'2100-02')).toBe('2100-02-28');expect(dueDate({...r,date:'2024-02-29',frequency:'annual'},'2000-02')).toBe('2000-02-29');expect(dueDate({...r,date:'2026-01-30'},'2028-02')).toBe('2028-02-29');expect(r).toEqual(before);
  });
  it('lembrete sem conta/valor não inventa categoria, adicionar não paga; associação usa IDs',()=>{
    let s=examples();s=act(s,{type:'recurring',definition:{id:'unknown',name:'Serviços Essenciais',amount:null,accountId:'',active:true,frequency:'monthly',date:'2026-11-30'}});s=act(s,{type:'month',period:'2026-12'});const before=structuredClone(month(s).initials);
    s=act(s,{type:'occurrence',id:'unknown:2026-12',mode:'add'});const l=month(s).lines.find(l=>l.id==='occ:unknown:2026-12')!;expect(l.categoryId).toBe('');expect(l.plan).toBeNull();expect(realized(month(s),l.id)).toBe(0);expect(month(s).initials).toEqual(before);expect(summary(s,month(s)).incomplete).toBe(true);
    s=act(s,{type:'removeLine',id:l.id});expect(month(s).occurrences.find(o=>o.definitionId==='unknown')!.state).toBe('open');s=act(s,{type:'occurrence',id:'unknown:2026-12',mode:'link',lineId:'services'});expect(month(s).lines.filter(l=>l.name==='Serviços Essenciais')).toHaveLength(1);
    s=act(s,{type:'month',period:'2026-12'});expect(month(s).occurrences.filter(o=>o.definitionId==='unknown')).toHaveLength(1);
  });
});

describe('Contraexemplos da revisão crítica',()=>{
  it('corrigir conferência antiga preserva o pagamento posterior: 100-40-2-10=48',()=>{
    let s=act(small(),pay('services',4000));s=act(s,reconcile(5500),'adj');s=act(s,pay('food',1000));
    s=act(s,{type:'correct',id:'adj',replacement:reconcile(5800)},'adj-correct');
    expect(balance(month(s),A)).toBe(4800);expect(month(s).events.at(-1)!.reconciliation).toEqual({source:A,calculated:6000,observed:5800});
    s=act(s,{type:'void',id:'adj-correct'});expect(balance(month(s),A)).toBe(5000);
  });
  it('corrigir conferência muda origem: reverte diferença original e confere o novo âmbito',()=>{
    let s=act(small(),pay('services',4000));s=act(s,reconcile(5500),'adj');
    s=act(s,{type:'correct',id:'adj',replacement:reconcile(24000,B)});
    expect(balance(month(s),A)).toBe(6000);expect(balance(month(s),B)).toBe(24000);expect(month(s).events.at(-1)!.deltas[B]).toBe(-1000);
  });
  it('corrigir observação antiga 60 para 65 preserva compra posterior 10: gasto 75',()=>{
    let s=act(examples(),pay());s=act(s,total(6000,B),'old-total');s=act(s,pay('food',1000));
    s=act(s,{type:'correct',id:'old-total',replacement:total(6500,B)});
    expect(realized(month(s),'food')).toBe(7500);expect(balance(month(s),A)).toBe(90000);expect(balance(month(s),B)).toBe(22500);
    expect(month(s).events.at(-1)!.totalObservation).toEqual({observed:6500,realizedBefore:4000,purchasesBefore:4000});
  });
  it('corrigir observação não compara o montante antigo com compras futuras',()=>{
    let s=act(examples(),pay());s=act(s,total(6000),'old-total');s=act(s,pay('food',10000));
    s=act(s,{type:'correct',id:'old-total',replacement:total(5000)});
    expect(realized(month(s),'food')).toBe(15000);expect(balance(month(s),A)).toBe(80000);
  });
  it('detalhe com identificador vazio é inválido, nunca se transforma em compra nova',()=>{
    rejected(examples(),pay('food',1000,A,{includedInTotal:''}),'ID');
  });
  it('históricos de entradas/saídas também respeitam limite seguro de agregação',()=>{
    let s=examples();for(const key of Object.keys(month(s).initials))month(s).initials[key]=0;month(s).initials[A]=5000000000000000;
    s=act(s,transfer(A,B,5000000000000000));s=act(s,transfer(B,A,5000000000000000));
    rejected(s,transfer(A,B,5000000000000000),'MONEY_LIMIT');
  });
});

it('subtotal do plano, incluindo receitas, não pode exceder o limite',()=>{
  let s=examples();s=act(s,{type:'line',line:{...s.base.find(l=>l.id==='income')!,plan:Number.MAX_SAFE_INTEGER}});
  rejected(s,{type:'line',line:{...s.base.find(l=>l.id==='income')!,id:'income-two',plan:1}},'MONEY_LIMIT');
});

it('formata anos civis inferiores a 100 sem os converter em 1900',()=>{expect(monthLabel('0001-02')).toBe('fevereiro de 1');expect(monthLabel('2026-11')).toBe('novembro de 2026');});
