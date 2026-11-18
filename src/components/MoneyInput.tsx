import type { InputHTMLAttributes } from 'react';
import { normalizeMoneyInput } from '@/domain/money';

export function MoneyInput({onValue,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'onChange'|'inputMode'> & {onValue:(value:string)=>void}){
  return <span className="money-input">
    <input {...props} inputMode="decimal" onChange={event=>onValue(normalizeMoneyInput(event.target.value))}/>
    <span aria-hidden="true">€</span>
  </span>;
}
