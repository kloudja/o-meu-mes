import { expect, it } from 'vitest';
import { examples } from '../../src/data/fixtures';
import { balance, budgetRemainder, dueDate, transact } from '../../src/domain/engine';
import { knownBankAvailability } from '../../src/domain/funding';

it.each([
  ['2026-01-29','2027-02','2027-02-28'],
  ['2026-01-30','2028-02','2028-02-29'],
  ['2026-01-31','2027-04','2027-04-30'],
  ['2026-01-31','2027-05','2027-05-31'],
])('ajusta a referência mensal %s em %s', (date,period,expected)=>{
  expect(dueDate({...examples().recurring[0],date},period)).toBe(expected);
});

it('fixa o mês e a data dos lembretes e impede segunda associação à mesma despesa',()=>{
  const original=examples();
  const period=original.selected;
  const linked=transact(original,{type:'occurrence',id:`car-annual:${period}`,mode:'link',lineId:'insurance'},'link');
  expect(()=>transact(linked,{type:'occurrence',id:`prime:${period}`,mode:'link',lineId:'insurance'},'second')).toThrow('ainda não esteja associada');
  const captured=transact(linked,{type:'snapshot',date:'2026-11-03'},'capture');
  const revised=transact(captured,{type:'recurring',definition:{...original.recurring[2],name:'Seguro revisto',date:'2026-11-29',amount:null}},'revise');
  const future=transact(revised,{type:'month',period:'2027-11'},'open');
  expect(future.months[period]).toEqual(captured.months[period]);
  expect(future.months[period].snapshot?.reminderDates).toEqual({insurance:'2026-11-20'});
  expect(future.months['2027-11'].occurrences.find(o=>o.definitionId==='car-annual')).toMatchObject({date:'2027-11-29',amount:null,state:'open'});
  expect(future.recurring[2].date).toBe('2026-11-29');
});

it('adiciona um lembrete sem montante nem conta sem criar gasto ou presumir zero',()=>{
  const original=examples();
  const definition={id:'unknown',name:'Serviço fictício',date:'2026-11-30',frequency:'monthly' as const,active:true,amount:null,accountId:''};
  const defined=transact(original,{type:'recurring',definition},'define');
  const withReserve=transact(defined,{type:'recurring',definition:{...definition,id:'reserve-only',reserveId:'car'}},'with-reserve');
  expect(withReserve.recurring.at(-1)?.accountId).toBe('moey-r');
  const december=transact(withReserve,{type:'month',period:'2026-12'},'open');
  const added=transact(december,{type:'occurrence',id:'unknown:2026-12',mode:'add'},'add');
  const month=added.months['2026-12'];
  expect(month.lines.find(l=>l.id==='occ:unknown:2026-12')).toMatchObject({plan:null,accountId:''});
  expect(month.events).toEqual([]);
  expect(month.initials).toEqual(december.months['2026-12'].initials);
  expect(knownBankAvailability(added,month)).toMatchObject({amount:null,partial:false});
});

it('separa sobra líquida da disponibilidade bancária e assinala valores por indicar',()=>{
  let state=examples();
  const month=()=>state.months[state.selected];
  expect(knownBankAvailability(state,month())).toMatchObject({amount:173500,partial:true});
  // The missing bank account has a commitment of €100. The other accounts
  // still have exactly €1,735 net, rather than a subtotal reduced by €100.
  month().lines.push({...month().lines[0],id:'bank-expense',accountId:'bank',plan:10000});
  expect(knownBankAvailability(state,month())).toMatchObject({amount:173500,partial:true});
  for(const [lineId,amount,source] of [['food',22000,'a:act-r'],['mimos',6500,'a:act-s']] as const){
    state=transact(state,{type:'execute',lineId,amount,source,date:'2026-11-04',complete:false},lineId);
  }
  expect(budgetRemainder(month())).toBe(4500);
  expect(knownBankAvailability(state,month())).toMatchObject({amount:170000,partial:true});
  expect(balance(month(),'r:em')).toBe(30000);
  month().lines.find(l=>l.id==='other')!.plan=null;
  expect(budgetRemainder(month())).toBeNull();
  expect(knownBankAvailability(state,month())).toMatchObject({amount:null,partial:false});
});
