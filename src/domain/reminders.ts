import { dueDate } from './engine';
import type { Recurring } from './model';
import { daysInMonth } from './validation';

export function advanceReminders(definitions:Recurring[],period:string,today:string){
  const [year,month]=period.split('-').map(Number);
  const current=period===today.slice(0,7);
  const start=current?today:`${period}-01`;
  const end=current?today:`${period}-${daysInMonth(year,month)}`;

  return definitions.flatMap(definition=>{
    const {id,name,active,reminderText,reminderDays}=definition;
    if(!active||!reminderText||reminderDays===undefined)return [];
    for(let offset=0;offset<=12;offset++){
      const targetYear=year+Math.floor((month-1+offset)/12);
      if(targetYear>9999)break;
      const targetMonth=(month-1+offset)%12+1;
      const date=dueDate(definition,`${String(targetYear).padStart(4,'0')}-${String(targetMonth).padStart(2,'0')}`);
      if(!date||date<start)continue;
      const trigger=new Date(`${date}T00:00:00Z`);
      trigger.setUTCDate(trigger.getUTCDate()-reminderDays);
      if(trigger<=new Date(`${end}T00:00:00Z`))return [{id,name,text:reminderText,date}];
      break;
    }
    return [];
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
