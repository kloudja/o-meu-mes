import { aid, rid, type State, type Month, type Recurring } from './model';
import { fail, validDate, validPeriod, daysInMonth } from './validation';
import { balance, precedingMonth, previousPeriod } from './projections';

export function dueDate(r:Recurring,period:string) {
  validPeriod(period);validDate(r.date);
  if(!['monthly','annual'].includes(r.frequency))fail('FREQUENCY','Periodicidade inválida.');
  if(r.frequency==='annual'&&r.date.slice(5,7)!==period.slice(5))return null;
  const [year,month]=period.split('-').map(Number);
  return `${period}-${String(Math.min(Number(r.date.slice(8)),daysInMonth(year,month))).padStart(2,'0')}`;
}
export function newMonth(s:State,period:string):Month {
  validPeriod(period);
  const previous=precedingMonth(s,period);
  const initials=Object.fromEntries([
    ...s.accounts.map(a=>[aid(a.id),previous?balance(previous,aid(a.id)):s.previousBalances?.period===previousPeriod(period)?s.previousBalances.balances[aid(a.id)]??null:null] as const),
    ...s.reserves.map(r=>[rid(r.id),null] as const),
  ]);
  return {period,lines:structuredClone(s.base),removedLines:[],initials,events:[],occurrences:s.recurring.filter(r=>r.active).flatMap(r=>{const date=dueDate(r,period);return date?[{id:`${r.id}:${period}`,definitionId:r.id,name:r.name,date,amount:r.amount,accountId:r.accountId,reserveId:r.reserveId,state:'open' as const}]:[];})};
}
