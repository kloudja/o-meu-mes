import { integer } from './validation';
export function parseMoney(value:string):number {
  const s=value.trim().replace(/\s|€/g,'');
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s)) throw new Error('Indique um montante válido, por exemplo 1.234,56.');
  const [whole,fraction='']=s.replaceAll('.','').split(',');
  const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(result>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Montante demasiado elevado.');
  return Number(result);
}
export const money=(n:number|null|undefined)=>{
  if(n==null)return 'Por indicar';
  integer(n);
  const absolute=Math.abs(n);
  const euros=String(Math.floor(absolute/100)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return `${n<0?'-':''}${euros},${String(absolute%100).padStart(2,'0')}\u00a0€`;
};
export const inputMoney=(n:number|null|undefined)=>n==null?'':`${Math.floor(n/100)},${String(n%100).padStart(2,'0')}`;
export const calendarDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const dateLabel=(date:string)=>date.slice(0,10).split('-').reverse().join('/');
export const monthLabel=(period:string)=>{
  const date=new Date(0);
  date.setFullYear(Number(period.slice(0,4)),Number(period.slice(5))-1,1);
  date.setHours(12,0,0,0);
  return new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(date);
};
