import { expect, it } from 'vitest';
import type { Recurring } from '../../src/domain/model';
import { advanceReminders } from '../../src/domain/reminders';

const insurance:Recurring={id:'insurance',name:'Seguro do Carro',frequency:'annual',active:true,date:'2026-12-07',amount:null,accountId:'',reminderText:'Renegociar seguro auto',reminderDays:30};

it('mostra a nota a partir de 30 dias antes, mesmo no mês anterior, e até ao pagamento',()=>{
  const notes=(today:string)=>advanceReminders([insurance],today.slice(0,7),today);
  expect(notes('2026-11-06')).toEqual([]);
  expect(notes('2026-11-07')).toEqual([{id:'insurance',name:'Seguro do Carro',text:'Renegociar seguro auto',date:'2026-12-07'}]);
  expect(notes('2026-12-07')).toHaveLength(1);
  expect(notes('2026-12-08')).toEqual([]);
});

it('respeita o dia ajustado de fevereiro e só mostra pagamentos ativos com nota',()=>{
  const monthly={...insurance,frequency:'monthly' as const,date:'2026-01-31',reminderDays:2};
  const definitions=[monthly,{...monthly,id:'off',active:false},{...monthly,id:'old',reminderText:undefined,reminderDays:undefined}];
  expect(advanceReminders(definitions,'2027-02','2027-02-25')).toEqual([]);
  expect(advanceReminders(definitions,'2027-02','2027-02-26').map(note=>note.date)).toEqual(['2027-02-28']);
});
