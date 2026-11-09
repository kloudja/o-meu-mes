export class DomainError extends Error {
  constructor(public code:string,message:string){super(message);this.name='DomainError';}
}
export function fail(code:string,message:string):never {throw new DomainError(code,message);}
export function integer(n:number):number {
  if(!Number.isSafeInteger(n))fail('MONEY_LIMIT','Montante fora do limite seguro de cêntimos.');
  return n;
}
export function amount(n:number):number {integer(n);if(n<0)fail('AMOUNT','Indique um montante positivo em cêntimos.');return n;}
export function sum(values:readonly number[]):number {
  const total=values.reduce((n,v)=>n+BigInt(integer(v)),0n);
  if(total>BigInt(Number.MAX_SAFE_INTEGER)||total< -BigInt(Number.MAX_SAFE_INTEGER))fail('MONEY_LIMIT','O total excede o limite seguro de cêntimos.');
  return Number(total);
}
export function knownSum(values:readonly (number|null)[]):number|null {return values.some(v=>v===null)?null:sum(values as number[]);}
export function validPeriod(p:string){if(!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(p))fail('PERIOD','Escolha um mês válido.');}
export function daysInMonth(year:number,month:number){return [31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][month-1];}
export function validDate(d:string,period?:string){
  if(!/^(?!0000)\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(d)||Number(d.slice(8))<1||Number(d.slice(8))>daysInMonth(Number(d.slice(0,4)),Number(d.slice(5,7)))||(period&&d.slice(0,7)!==period))
    fail('DATE',period?'A data deve ser válida e pertencer ao mês selecionado.':'Indique uma data de calendário válida.');
}
export function validId(id:string){if(typeof id!=='string'||!id.trim()||['__proto__','prototype','constructor'].includes(id))fail('ID','Identificador inválido.');}
export function validName(name:string){if(typeof name!=='string'||!name.trim())fail('NAME','Indique o nome.');}
