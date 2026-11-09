import type { State, Line } from '../domain/model';
import { aid, rid } from '../domain/model';
import { newMonth } from '../domain/engine';
const line=(id:string,name:string,plan:number,accountId:string,categoryId:string,extra:Partial<Line>={}):Line=>({id,name,plan,accountId,categoryId,kind:'expense',...extra});
export function examples():State {
  const s:State={selected:'2026-11',requests:{},months:{},
    accounts:[['act-r','ActivoBank A','#7a9c8c'],['act-s','ActivoBank B','#9eabc3'],['moey-r','Moey! A','#6eaaa6'],['moey-s','Moey! B','#b3a1bb'],['san','Santander','#c79586'],['bank','BankInter A','#c5ad74']].map(([id,name,color])=>({id,name,color,restricted:false})),
    categories:['Habitação','Serviços Essenciais','Refeições/Supermercado','Seguros','Comunicações','Mobilidade','Poupanças','Lazer/Outros','Educação/Infância','Cartões e Créditos','Alimentação','Saúde','Casa-OutrosGastos','Categoria de exemplo'].map((name,i)=>({id:['cat-habitacao','cat-servicos','cat-refeicoes','cat-seguros','cat-comunicacoes','cat-mobilidade','cat-poupancas','cat-lazer','cat-educacao','cat-creditos','cat-alimentacao','cat-saude','cat-casa','cat-exemplo'][i],name})),
    reserves:[{id:'em',name:'Fundo Emergência',accountId:'moey-r'},{id:'car',name:'Seguro do Carro',accountId:'moey-r'},{id:'gas',name:'Gasolina',accountId:'moey-s'}],
    base:[line('rent','Habitação',8500,'act-r','cat-habitacao'),line('services','Serviços Essenciais',10000,'act-r','cat-servicos'),line('food','Comida',20000,'act-r','cat-refeicoes',{variable:true}),line('mimos','Mimos',5000,'act-s','cat-lazer',{variable:true}),line('other','Outras Despesas',8000,'act-r','cat-casa',{variable:true}),line('insurance','Seguro do Carro',15000,'san','cat-seguros'),line('health','ADSE',4000,'moey-r','cat-saude',{reserveId:'em'}),line('income','Recebimento de exemplo',120000,'act-r','cat-lazer',{kind:'income'}),line('save-em','Fundo Emergência',10000,'moey-r','cat-poupancas',{kind:'saving',reserveId:'em'})],
    recurring:[{id:'google',name:'Google One',date:'2026-11-15',frequency:'monthly',active:true,amount:199,accountId:'act-r'}, {id:'prime',name:'Amazon Prime',date:'2026-11-30',frequency:'annual',active:true,amount:null,accountId:'act-r'},{id:'car-annual',name:'Seguro do Carro',date:'2026-11-20',frequency:'annual',active:true,amount:15000,accountId:'san'}]
  };
  const m=newMonth(s,s.selected);
  m.initials=Object.fromEntries(s.accounts.map(a=>[aid(a.id),{ 'act-r':95000,'act-s':25000,'moey-r':100000,'moey-s':20000,'san':10000,'bank':null }[a.id]??null]));
  Object.assign(m.initials,{[rid('em')]:30000,[rid('car')]:0,[rid('gas')]:null});
  s.months[s.selected]=m;return s;
}
