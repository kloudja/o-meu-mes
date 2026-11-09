import { expect, it } from 'vitest';
import { accountFunding } from '../../src/domain/funding';
import { balance, newMonth, realized, transact } from '../../src/domain/engine';
import type { State } from '../../src/domain/model';
function setup(){
  const s:State={selected:'2026-11',requests:{},accounts:[{id:'a',name:'Conta A',color:'#123456',restricted:false},{id:'b',name:'Conta B',color:'#abcdef',restricted:false}],categories:[],reserves:[{id:'r',name:'Reserva',accountId:'a'}],recurring:[],base:[],months:{}};
  s.months[s.selected]=newMonth(s,s.selected);
  const m=s.months[s.selected];m.initials={'a:a':10000,'a:b':50000,'r:r':100000};
  m.lines=[{id:'expense',name:'Despesa',kind:'expense',plan:15000,accountId:'a',categoryId:''},{id:'saving',name:'Reforço',kind:'saving',plan:5000,accountId:'a',categoryId:'',reserveId:'r'},{id:'reserved',name:'Paga pela reserva',kind:'expense',plan:4000,accountId:'a',categoryId:'',reserveId:'r'},{id:'income',name:'Receita por receber',kind:'income',plan:90000,accountId:'a',categoryId:''}];
  return s;
}
const report=(s:State)=>accountFunding(s,s.months[s.selected]);
it('despesas 150 + reforço 50 − saldo 100 = transferir 100; outra conta com saldo não compensa',()=>{
  const s=setup(),before=structuredClone(s),r=report(s);expect(r.accounts[0]).toMatchObject({expenses:15000,savings:5000,required:20000,current:10000,transfer:10000});expect(r.accounts[1].transfer).toBe(0);expect(r.total).toBe(10000);expect(s).toEqual(before);
});
it('exclui receitas futuras e despesa de 40 financiada pela reserva já constituída',()=>{
  const s=setup();expect(report(s).accounts[0].required).toBe(20000);expect(report(s).reserves).toEqual([]);
  s.months[s.selected].initials['r:r']=0;const r=report(s);expect(r.accounts[0].transfer).toBe(10000);expect(r.reserves).toMatchObject([{reserve:{id:'r'},current:0,required:4000,missing:4000}]);
});
it('pagamento parcial reduz saldo e pendente sem alterar a necessidade; receber dinheiro reduz a falta',()=>{
  let s=transact(setup(),{type:'execute',lineId:'expense',amount:4000,source:'a:a',complete:false,date:'2026-11-02'},'pay');expect(report(s).accounts[0]).toMatchObject({expenses:11000,current:6000,transfer:10000});
  s=transact(s,{type:'execute',lineId:'income',amount:2500,source:'a:a',complete:false,date:'2026-11-02'},'income');expect(report(s).accounts[0].transfer).toBe(7500);
});
it('transferência recebida atualiza o cálculo e anular restaura a indicação',()=>{
  let s=transact(setup(),{type:'transfer',source:'a:b',destination:'a:a',amount:10000,date:'2026-11-02'},'transfer');expect(report(s).accounts[0].transfer).toBe(0);s=transact(s,{type:'void',id:'transfer'},'void');expect(report(s).accounts[0].transfer).toBe(10000);
});
it('saldos e planos desconhecidos não são tratados como zero; linhas concluídas não exigem a diferença',()=>{
  const s=setup(),m=s.months[s.selected];m.initials['a:a']=null;expect(report(s).accounts[0].transfer).toBeNull();expect(report(s).total).toBeNull();
  m.initials['a:a']=10000;m.lines[0].plan=null;expect(report(s).accounts[0].expenses).toBeNull();
  const next=transact(s,{type:'execute',lineId:'expense',amount:2000,source:'a:a',complete:true,date:'2026-11-02'},'complete');expect(report(next).accounts[0]).toMatchObject({expenses:0,savings:5000,current:8000,transfer:0});
});
it('despesas sem conta deixam total por apurar, sem serem atribuídas a outra conta',()=>{
  const s=setup();s.months[s.selected].lines[0].accountId='';const r=report(s);expect(r.unassigned.map(l=>l.id)).toEqual(['expense']);expect(r.total).toBeNull();expect(r.accounts[0].expenses).toBe(0);
});
it('arquivo não oculta compromissos antigos e origem restrita não financia outras contas',()=>{
  const s=setup();s.accounts[0].archived=true;s.accounts[1].restricted=true;const r=report(s);expect(r.accounts).toHaveLength(1);expect(r.accounts[0].transfer).toBe(10000);
});
it('mês novo não usa saldo do mês anterior; centimos são exatos e o cálculo nunca sugere valor negativo',()=>{
  const s=setup();s.months[s.selected].lines[0].plan=5001;s.months[s.selected].initials['a:a']=10000;expect(report(s).accounts[0].transfer).toBe(1);
  s.months[s.selected].initials['a:a']=20000;expect(report(s).accounts[0].transfer).toBe(0);
  s.selected='2026-12';s.months[s.selected]=newMonth(s,s.selected);expect(report(s).accounts[0].transfer).toBeNull();expect(report(s).total).toBeNull();
});

it('sugere origem, destino e montante usando só o excedente depois dos compromissos da origem',()=>{
  const s=setup(),m=s.months[s.selected];
  m.lines.push({id:'own-b',name:'Compromisso da origem',kind:'expense',plan:45000,accountId:'b',categoryId:''});
  const before=structuredClone(s),r=report(s);
  expect(r.suggestions.map(x=>[x.source.id,x.destination.id,x.amount])).toEqual([['b','a',5000]]);
  expect(r.suggested).toBe(5000);expect(r.uncovered).toBe(5000);expect(r.remaining.find(x=>x.account.id==='a')?.amount).toBe(5000);expect(s).toEqual(before);
});
it('reparte várias origens e destinos sem reutilizar o mesmo excedente e mostra a parte não coberta',()=>{
  const s=setup(),m=s.months[s.selected];
  s.accounts.push({id:'c',name:'Conta C',color:'#123456',restricted:false},{id:'d',name:'Conta D',color:'#123456',restricted:false});
  m.initials['a:b']=12000;m.initials['a:c']=3000;m.initials['a:d']=0;
  m.lines.push({id:'d-expense',name:'Despesa D',kind:'expense',plan:8000,accountId:'d',categoryId:''});
  const r=report(s);expect(r.suggestions.map(x=>[x.source.id,x.destination.id,x.amount])).toEqual([['b','a',10000],['b','d',2000],['c','d',3000]]);expect(r.suggested).toBe(15000);expect(r.uncovered).toBe(3000);
  const action={type:'recordSuggestedTransfers',period:s.selected,date:'2026-11-03',routes:[
    {source:'a:b',destination:'a:a',amount:10000},{source:'a:b',destination:'a:d',amount:2000},{source:'a:c',destination:'a:d',amount:3000}
  ]} as const satisfies import('../../src/domain/engine').Action;
  expect(()=>transact(s,{...action,routes:action.routes.slice(0,2)},'partial')).toThrow('sugeridas mudaram');
  expect(()=>transact(s,{...action,period:'2026-12'},'wrong-month')).toThrow('sugeridas mudaram');
  const next=transact(s,action,'batch');
  expect(next.months[next.selected].events.map(event=>event.deltas)).toEqual([
    {'a:b':-10000,'a:a':10000},{'a:b':-2000,'a:d':2000},{'a:c':-3000,'a:d':3000}
  ]);
  expect(transact(next,action,'batch')).toBe(next);
  expect(m.events).toEqual([]);
  expect(report(next).suggestions).toEqual([]);expect(report(next).uncovered).toBe(3000);
});

it('dá prioridade à conta planeada quando a compra noutra conta cria uma falta',()=>{
  const s=setup(),m=s.months[s.selected];
  s.accounts.push({id:'c',name:'Conta C',color:'#123456',restricted:false});
  m.initials['a:c']=20000;
  m.lines.push({id:'food',name:'Comida',kind:'expense',plan:10000,accountId:'c',categoryId:'',variable:true});
  const next=transact(s,{type:'execute',lineId:'food',amount:3000,source:'a:a',complete:false,date:'2026-11-04'},'purchase');
  const month=next.months[next.selected];
  expect(balance(month,'a:a')).toBe(7000);
  expect(balance(month,'a:c')).toBe(20000);
  expect(realized(month,'food')).toBe(3000);
  expect(report(next).suggestions.map(x=>[x.source.id,x.destination.id,x.amount])).toEqual([['c','a',3000],['b','a',10000]]);
  const undo=transact(next,{type:'void',id:'purchase'},'undo');
  expect(report(undo).suggestions.map(x=>[x.source.id,x.destination.id,x.amount])).toEqual([['b','a',10000]]);
});
it('origem desconhecida, arquivada ou restrita não financia sugestões; reservas e receitas futuras não são usadas',()=>{
  const s=setup(),m=s.months[s.selected];m.initials['a:b']=null;expect(report(s).suggestions).toEqual([]);
  m.initials['a:b']=50000;m.lines.push({id:'unknown-b',name:'Sem previsão',kind:'expense',plan:null,accountId:'b',categoryId:''});expect(report(s).suggestions).toEqual([]);
  m.lines.pop();s.accounts[1].archived=true;expect(report(s).suggestions).toEqual([]);
  s.accounts[1].archived=false;s.accounts[1].restricted=true;expect(report(s).suggestions).toEqual([]);
  expect(report(s).remaining[0].amount).toBe(10000);
});
it('compromisso sem conta impede gastar excedente que pode pertencer a esse compromisso',()=>{
  const s=setup();s.months[s.selected].lines.push({id:'unassigned',name:'Conta em falta',kind:'expense',plan:10000,accountId:'',categoryId:''});const r=report(s);expect(r.suggestions).toEqual([]);expect(r.total).toBeNull();expect(r.uncovered).toBeNull();
});
it('uma transferência completa elimina a sugestão e a anulação volta a propô-la',()=>{
  let s=setup();expect(report(s).suggestions.map(x=>[x.source.id,x.destination.id,x.amount])).toEqual([['b','a',10000]]);
  s=transact(s,{type:'transfer',source:'a:b',destination:'a:a',amount:10000,date:'2026-11-03'},'full');expect(report(s).suggestions).toEqual([]);
  s=transact(s,{type:'void',id:'full'},'undo-full');expect(report(s).suggestions[0].amount).toBe(10000);
});
