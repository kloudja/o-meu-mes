import { describe, expect, it } from 'vitest';
import { examples } from '../../src/data/fixtures';
import { balance, dueDate, initialPlan, newMonth, pending, realized, summary, transact, type Action } from '../../src/domain/engine';
import { money, parseMoney } from '../../src/domain/money';
import { aid, rid, type State } from '../../src/domain/model';
const withRestricted=()=>{const s=examples();s.accounts.push({id:'restricted-test',name:'Origem restrita de teste',color:'#999999',restricted:true});s.months[s.selected].initials[aid('restricted-test')]=18000;return s;};
const month=(s:State)=>s.months[s.selected];
let sequence=0;
const act=(s:State,a:Action)=>transact(s,a,`test-${++sequence}`);
const pay=(id:string,amount:number,complete=false,source=aid('act-r')):Action=>({type:'execute',lineId:id,amount,complete,source,date:'2026-11-02'});

describe('Contrato demonstrado com valores esperados independentes',()=>{
  it('investir 25 reduz a conta em 25 sem contar como despesa nem aumentar uma reserva',()=>{
    const line={id:'investment-test',name:'Investimento de teste',kind:'investment' as const,plan:2500,accountId:'act-r',categoryId:'cat-poupancas'};
    const planned=act(examples(),{type:'line',line});
    const before=summary(planned,month(planned));
    expect(()=>act(planned,pay(line.id,2500,true,rid('em')))).toThrow('conta principal');
    const executed=act(planned,pay(line.id,2500,true));
    const after=summary(executed,month(executed));
    expect(after.expenses).toBe(before.expenses);
    expect(after.savings).toBe(before.savings!-2500);
    expect(balance(month(executed),aid('act-r'))).toBe(balance(month(planned),aid('act-r'))!-2500);
    expect(balance(month(executed),rid('em'))).toBe(balance(month(planned),rid('em')));
  });
  it('85 previstos e pagos; referência preservada, saldo 865 e pendente zero',()=>{let s=examples();s=act(s,{type:'snapshot',date:'2026-11-02'});s=act(s,pay('rent',8500,true));expect(initialPlan(month(s),month(s).lines[0])).toBe(8500);expect(realized(month(s),'rent')).toBe(8500);expect(pending(month(s),month(s).lines[0])).toBe(0);expect(balance(month(s),aid('act-r'))).toBe(86500);});
  it('100 previstos, parcial 40, falta 60; funciona sem plano inicial',()=>{let s=act(examples(),pay('services',4000));expect(month(s).snapshot).toBeUndefined();expect(realized(month(s),'services')).toBe(4000);expect(pending(month(s),month(s).lines.find(l=>l.id==='services')!)).toBe(6000);});
  it.each([[9200,700],[8000,-500]])('concluído por %i, desvio %i, sem pendentes', (amount,deviation)=>{const s=act(examples(),pay('rent',amount,true)),m=month(s);expect(pending(m,m.lines[0])).toBe(0);expect(realized(m,'rent')-8500).toBe(deviation);});
  it('snapshot 100, atual 120, parcial 40 deixa 80',()=>{let s=act(examples(),{type:'snapshot',date:'2026-11-02'});s=act(s,{type:'line',line:{...month(s).lines[1],plan:12000}});s=act(s,pay('services',4000));expect(initialPlan(month(s),month(s).lines[1])).toBe(10000);expect(pending(month(s),month(s).lines[1])).toBe(8000);expect(()=>act(s,{type:'snapshot',date:'2026-11-03'})).toThrow('já foi guardado');});
  it('nova linha de 30 tem inicial zero, atual e pendente 30',()=>{let s=act(examples(),{type:'snapshot',date:'2026-11-02'});const line={...month(s).lines[0],id:'new',name:'Exemplo adicional',plan:3000};s=act(s,{type:'line',line});expect(initialPlan(month(s),line)).toBe(0);expect(pending(month(s),line)).toBe(3000);});
  it('reforço 100: principal 900, reserva 100; despesa 40: principal 900 e reserva 60',()=>{let s=examples();month(s).initials[rid('em')]=0;s=act(s,pay('save-em',10000,true,aid('moey-r')));expect(balance(month(s),aid('moey-r'))).toBe(90000);expect(balance(month(s),rid('em'))).toBe(10000);expect(month(s).events.filter(e=>month(s).lines.find(l=>l.id===e.lineId)?.kind==='expense')).toHaveLength(0);s=act(s,pay('health',4000,true,rid('em')));expect(balance(month(s),aid('moey-r'))).toBe(90000);expect(balance(month(s),rid('em'))).toBe(6000);expect(realized(month(s),'health')).toBe(4000);});
  it('compras 40, total 60 = gasto 60 e ajuste 20; total abaixo de 40 exige resolução',()=>{let s=act(examples(),pay('food',4000));s=act(s,{...pay('food',6000),type:'execute',lineId:'food',amount:6000,date:'2026-11-02',source:aid('act-r'),complete:false,total:true});expect(realized(month(s),'food')).toBe(6000);expect(month(s).events[1].amount).toBe(2000);expect(balance(month(s),aid('act-r'))).toBe(89000);expect(()=>act(s,{type:'execute',lineId:'food',amount:3000,date:'2026-11-02',source:aid('act-r'),complete:false,total:true})).toThrow('inferior às compras');expect(realized(month(s),'food')).toBe(6000);});
  it('sobra 50 com 200/150; excesso de 10 reduz sobra líquida a 40; não reforça o fundo',()=>{let s=examples();month(s).lines=month(s).lines.filter(l=>['food','mimos'].includes(l.id));month(s).lines.find(l=>l.id==='mimos')!.plan=0;s=act(s,pay('food',15000));expect(summary(s,month(s)).leftover).toBe(5000);s=act(s,pay('mimos',1000,false,aid('act-s')));expect(summary(s,month(s)).leftover).toBe(4000);expect(balance(month(s),rid('em'))).toBe(30000);});
  it('100 menos 40, conferência 55 produz ajuste -5 uma vez',()=>{let s=examples();month(s).initials[aid('act-r')]=10000;s=act(s,pay('services',4000));expect(balance(month(s),aid('act-r'))).toBe(6000);const action:Action={type:'reconcile',source:aid('act-r'),amount:5500,date:'2026-11-02',note:'Diferença de exemplo'};s=transact(s,action,'reconcile-once');s=transact(s,action,'reconcile-once');expect(balance(month(s),aid('act-r'))).toBe(5500);expect(month(s).initials[aid('act-r')]).toBe(10000);expect(month(s).events[1].deltas[aid('act-r')]).toBe(-500);});
  it('mês novo recebe Modelo Base, sem execução, saldos ou snapshot; reabrir é idempotente',()=>{let s=act(examples(),pay('rent',4000));const previous=structuredClone(month(s));s=act(s,{type:'line',target:'base',line:{...s.base[0],plan:9900}});s=act(s,{type:'month',period:'2026-12'});expect(month(s).events).toEqual([]);expect(Object.values(month(s).initials).every(v=>v===null)).toBe(true);expect(month(s).snapshot).toBeUndefined();expect(month(s).lines[0].plan).toBe(9900);expect(pending(month(s),month(s).lines[0])).toBe(9900);expect(s.months['2026-11']).toEqual(previous);s=act(s,{type:'month',period:'2026-11'});expect(month(s)).toEqual(previous);});
  it('lembretes não alteram totais; associação não duplica linha; anual novembro não em dezembro',()=>{let s=examples();const before=summary(s,month(s));expect(month(s).occurrences).toHaveLength(3);expect(newMonth(s,'2026-12').occurrences.map(o=>o.definitionId)).toEqual(['google']);const n=month(s).lines.length;s=act(s,{type:'occurrence',id:'car-annual:2026-11',mode:'link',lineId:'insurance'});expect(month(s).lines).toHaveLength(n);expect(summary(s,month(s))).toEqual(before);s=act(s,{type:'month',period:'2026-11'});expect(month(s).occurrences).toHaveLength(3);s=act(s,{type:'occurrence',id:'google:2026-11',mode:'add'});expect(month(s).lines).toHaveLength(n+1);expect(realized(month(s),'occ:google:2026-11')).toBe(0);expect(()=>act(s,{type:'occurrence',id:'google:2026-11',mode:'add'})).toThrow('já foi tratado');});
  it('origem restrita de teste não paga falta em Santander e não entra em dinheiro livre',()=>{const s=withRestricted();expect(summary(s,month(s)).available).toBe(250000);expect(balance(month(s),aid('restricted-test'))).toBe(18000);expect(()=>act(s,pay('insurance',15000,true,aid('san')))).toThrow('faltam 50,00');expect(month(s).events).toHaveLength(0);});
  it('cêntimos exatos e formatos portugueses',()=>{expect(parseMoney('0,10')).toBe(10);expect(parseMoney('1.234,56')).toBe(123456);expect(parseMoney('0,10')+parseMoney('0,20')).toBe(30);expect(()=>parseMoney('1.2')).toThrow();expect(()=>parseMoney('-1')).toThrow();});
  it('dia 31 e obrigação anual em 29 de fevereiro usam último dia',()=>{const r=examples().recurring[0];expect(dueDate({...r,date:'2026-01-31'},'2026-02')).toBe('2026-02-28');expect(dueDate({...r,date:'2024-02-29',frequency:'annual'},'2027-02')).toBe('2027-02-28');expect(dueDate({...r,date:'2024-02-29',frequency:'annual'},'2028-02')).toBe('2028-02-29');});
  it('anular reverte efeitos; duplo pedido não duplica; transferência não é despesa',()=>{let s=examples();s=transact(s,pay('rent',8500,true),'once');s=transact(s,pay('rent',8500,true),'once');expect(month(s).events).toHaveLength(1);s=act(s,{type:'void',id:'once'});expect(balance(month(s),aid('act-r'))).toBe(95000);expect(realized(month(s),'rent')).toBe(0);s=act(s,{type:'transfer',source:aid('act-r'),destination:aid('act-s'),amount:5000,date:'2026-11-02'});expect(balance(month(s),aid('act-r'))).toBe(90000);expect(balance(month(s),aid('act-s'))).toBe(30000);expect(realized(month(s),'rent')).toBe(0);});
  it('anulação de reforço já utilizado falha atomicamente',()=>{let s=examples();month(s).initials[rid('em')]=0;s=transact(s,pay('save-em',10000,true,aid('moey-r')),'reinforcement');s=act(s,pay('health',4000,true,rid('em')));expect(()=>act(s,{type:'void',id:'reinforcement'})).toThrow('negativa');expect(balance(month(s),rid('em'))).toBe(6000);expect(month(s).events[0].voided).toBeUndefined();});
  it('saldo em falta não vira zero; datas de outros meses são rejeitadas',()=>{const s=examples();expect(balance(month(s),aid('bank'))).toBeNull();expect(()=>act(s,{type:'execute',lineId:'rent',amount:100,date:'2026-12-01',source:aid('act-r'),complete:false})).toThrow('mês selecionado');});
  it('formato explícito de milhares e sinal; desconhecido permanece desconhecido no snapshot',()=>{expect(money(123456)).toBe('1.234,56\u00a0€');expect(money(-500)).toBe('-5,00\u00a0€');let s=examples();month(s).lines[0].plan=null;s=act(s,{type:'snapshot',date:'2026-11-02'});expect(initialPlan(month(s),month(s).lines[0])).toBeNull();});
  it('não usa origem restrita de teste para seguros; rejeita alteração de data inválida',()=>{const s=withRestricted();expect(()=>act(s,pay('insurance',1000,false,aid('restricted-test')))).toThrow('só financia');expect(()=>act(s,{type:'execute',lineId:'rent',amount:10,date:'2026-11-31',source:aid('act-r'),complete:false})).toThrow('mês selecionado');});
  it('despesa sem conta torna o resumo incompleto mesmo com todos os saldos conhecidos',()=>{const s=examples();for(const key of Object.keys(month(s).initials))month(s).initials[key]??=0;month(s).lines[0].accountId='';expect(summary(s,month(s)).incomplete).toBe(true);});
  it('permite indicar os saldos em falta e reforçar numa única confirmação idempotente',()=>{
    let s=act(examples(),{type:'month',period:'2026-12'});
    const operation:Action={type:'execute',lineId:'save-em',amount:10000,date:'2026-12-02',source:aid('moey-r'),complete:true,initials:{[aid('moey-r')]:100000,[rid('em')]:0}};
    s=transact(s,operation,'initial-and-saving');s=transact(s,operation,'initial-and-saving');
    expect(month(s).initials[aid('moey-r')]).toBe(100000);expect(month(s).initials[rid('em')]).toBe(0);
    expect(balance(month(s),aid('moey-r'))).toBe(90000);expect(balance(month(s),rid('em'))).toBe(10000);expect(month(s).events).toHaveLength(1);
    expect(s.months['2026-11'].initials[rid('em')]).toBe(30000);
  });
  it('não aplica os saldos indicados se o reforço falhar por insuficiência',()=>{
    const s=act(examples(),{type:'month',period:'2026-12'});
    expect(()=>act(s,{type:'execute',lineId:'save-em',amount:10000,date:'2026-12-02',source:aid('moey-r'),complete:true,initials:{[aid('moey-r')]:5000,[rid('em')]:0}})).toThrow('faltam 50,00');
    expect(month(s).initials[aid('moey-r')]).toBeNull();expect(month(s).initials[rid('em')]).toBeNull();expect(month(s).events).toHaveLength(0);
  });
  it('a confirmação conjunta não substitui saldos existentes nem aceita origens alheias',()=>{
    const s=examples();expect(()=>act(s,{type:'execute',lineId:'save-em',amount:1000,date:'2026-11-02',source:aid('moey-r'),complete:false,initials:{[rid('em')]:0}})).toThrow('já indicado');
    expect(()=>act(s,{type:'transfer',source:aid('act-r'),destination:aid('act-s'),amount:1000,date:'2026-11-02',initials:{[rid('gas')]:0}})).toThrow('não pertence');
  });
  it('o nome pertence à compra, sem alterar o orçamento nem duplicar totais',()=>{
    let s=act(examples(),{type:'execute',lineId:'food',amount:4000,date:'2026-11-02',source:aid('act-r'),complete:false,description:'  Continente  '});
    expect(month(s).events[0].description).toBe('Continente');expect(month(s).lines.find(l=>l.id==='food')!.name).toBe('Comida');
    s=act(s,{type:'execute',lineId:'food',amount:6000,date:'2026-11-02',source:aid('act-r'),complete:false,total:true,description:'Não é uma compra'});
    expect(realized(month(s),'food')).toBe(6000);expect(month(s).events[1].description).toBeUndefined();
  });
});
