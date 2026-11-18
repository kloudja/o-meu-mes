import { activeEvents, balance, obligations, pending, plannedSource } from './engine';
import { aid, rid, type Month, type State } from './model';
import { knownSum, sum } from './validation';

export interface TransferRoute { source:string; destination:string; amount:number }
interface PaymentReason { id:string; name:string; category?:string; description?:string; amount:number }
interface ReimbursementRoute extends TransferRoute { reasons:PaymentReason[] }

function offsetPayments(route:ReimbursementRoute,amount:number){
  const covered=Math.min(route.amount,amount);
  route.amount-=covered;
  let remaining=covered;
  for(const reason of route.reasons){
    const part=Math.min(reason.amount,remaining);
    reason.amount-=part;
    remaining-=part;
    if(!remaining)break;
  }
  return covered;
}
export const transferRoutes=(suggestions:ReturnType<typeof accountFunding>['suggestions']):TransferRoute[]=>
  suggestions.map(({source,destination,amount})=>({source:aid(source.id),destination:aid(destination.id),amount}));

export function reserveFunding(state:State,month:Month){
  return state.reserves.flatMap(reserve=>{
    const required=obligations(month,rid(reserve.id)),current=balance(month,rid(reserve.id));
    if(required===0)return [];
    const missing=current===null||required===null?null:Math.max(0,sum([required,-current]));
    return missing===0?[]:[{reserve,required,current,missing}];
  });
}

/** Amount still needed in each principal account, using confirmed execution only. */
export function accountFunding(state:State,month:Month){
  const accounts=state.accounts.filter(a=>!a.restricted).map(account=>{
    const source=aid(account.id);
    const expenses=knownSum(month.lines.filter(l=>l.kind==='expense'&&plannedSource(l)===source).map(l=>pending(month,l)));
    const savings=knownSum(month.lines.filter(l=>(l.kind==='saving'||l.kind==='investment')&&plannedSource(l)===source).map(l=>pending(month,l)));
    const required=obligations(month,source),current=balance(month,source);
    const transfer=current===null||required===null?null:Math.max(0,sum([required,-current]));
    const surplus=current===null||required===null?null:Math.max(0,sum([current,-required]));
    return {account,expenses,savings,required,current,transfer,surplus};
  });
  const unassigned=month.lines.filter(l=>l.kind!=='income'&&!state.accounts.some(a=>a.id===l.accountId)&&pending(month,l)!==0);
  const reserves=reserveFunding(state,month);
  const donors=accounts.filter(r=>!r.account.archived&&r.surplus!==null&&r.surplus>0).map(r=>({account:r.account,available:r.surplus!}));
  const suggestions:{source:State['accounts'][number];destination:State['accounts'][number];amount:number}[]=[];
  const remaining=accounts.map(row=>({account:row.account,amount:row.transfer}));
  const events=activeEvents(month);
  const reductions=new Map<string,number>();
  for(const event of events){
    if(event.type!=='total'||event.amount>=0)continue;
    for(const [id,n] of Object.entries(event.allocations??{}))reductions.set(id,sum([reductions.get(id)??0,n]));
  }
  const paidOutsidePlan=new Map<string,ReimbursementRoute>();
  const routeKey=(from:string,to:string)=>JSON.stringify([from,to]);
  for(const event of events){
    const from=Object.keys(event.deltas).find(key=>event.deltas[key]<0);
    if(!from?.startsWith('a:'))continue;
    if(event.type==='transfer'){
      const to=Object.keys(event.deltas).find(key=>event.deltas[key]>0);
      if(to?.startsWith('a:')){
        const key=routeKey(from,to);
        const route=paidOutsidePlan.get(key);
        if(route)offsetPayments(route,-event.deltas[from]);
      }
    }else if(event.amount>0&&(event.type==='execution'||event.type==='total')){
      const line=event.line??month.lines.find(l=>l.id===event.lineId);
      if(line?.kind!=='expense'||line.reserveId||!line.accountId||aid(line.accountId)===from)continue;
      const planned=aid(line.accountId);
      let amount=sum([event.amount,-(reductions.get(event.id)??0)]);
      const opposite=paidOutsidePlan.get(routeKey(from,planned));
      if(opposite)amount-=offsetPayments(opposite,amount);
      const key=routeKey(planned,from);
      const route=paidOutsidePlan.get(key)??{source:planned,destination:from,amount:0,reasons:[]};
      if(amount>0){
        route.amount=sum([route.amount,amount]);
        route.reasons.push({id:event.id,name:line.name,category:state.categories.find(c=>c.id===line.categoryId)?.name,description:event.description,amount});
      }
      paidOutsidePlan.set(key,route);
    }
  }
  const reimbursements=[...paidOutsidePlan.values()].flatMap(route=>{
    const source=accounts.find(row=>aid(row.account.id)===route.source);
    const destination=accounts.find(row=>aid(row.account.id)===route.destination);
    return source&&destination&&route.amount>0?[{source:source.account,destination:destination.account,amount:route.amount,suggested:0,reasons:route.reasons.filter(reason=>reason.amount>0)}]:[];
  });
  const addSuggestion=(donor:typeof donors[number],row:typeof remaining[number],amount:number)=>{
    const route=suggestions.find(r=>r.source===donor.account&&r.destination===row.account);
    if(route)route.amount=sum([route.amount,amount]);
    else suggestions.push({source:donor.account,destination:row.account,amount});
    donor.available-=amount;
    if(row.amount!==null)row.amount=Math.max(0,row.amount-amount);
  };
  // Allocate reimbursements first, while protecting the donor's own remaining plan.
  // Prefer extending an existing route, then covering the remainder from one account.
  if(!unassigned.length){
    for(const reimbursement of reimbursements){
      const donor=donors.find(d=>d.account===reimbursement.source);
      const row=remaining.find(r=>r.account===reimbursement.destination);
      if(!donor||!row||row.account.archived||balance(month,aid(row.account.id))===null)continue;
      const amount=Math.min(donor.available,reimbursement.amount);
      if(amount>0){
        addSuggestion(donor,row,amount);
        reimbursement.suggested=amount;
      }
    }
    const shortages=remaining.filter(row=>row.amount!==null&&row.amount>0&&!row.account.archived);
    if(sum(donors.map(donor=>donor.available))>=sum(shortages.map(row=>row.amount!))){
      // When all deficits can be covered, try the ones that fit a single donor before splitting.
      const largest=Math.max(0,...donors.map(donor=>donor.available));
      shortages.sort((a,b)=>Number(a.amount!>largest)-Number(b.amount!>largest));
    }
    for(const row of shortages){
      const existing=donors.filter(donor=>suggestions.some(route=>route.source===donor.account&&route.destination===row.account));
      for(const donor of existing){
        const take=Math.min(row.amount!,donor.available);
        if(take>0)addSuggestion(donor,row,take);
      }
      if(row.amount===0)continue;
      const needed=row.amount!;
      const eligible=donors.filter(donor=>donor.available>=needed);
      if(shortages.length>1)eligible.sort((a,b)=>a.available-b.available);
      const covering=eligible[0];
      if(covering){
        addSuggestion(covering,row,needed);
        continue;
      }
      const largestFirst=[...donors].sort((a,b)=>b.available-a.available);
      for(const donor of largestFirst){
        const take=Math.min(row.amount!,donor.available);
        if(take>0)addSuggestion(donor,row,take);
        if(row.amount===0)break;
      }
    }
  }
  return {accounts,total:unassigned.length?null:knownSum(accounts.map(a=>a.transfer)),unassigned,reserves,reimbursements,suggestions,remaining,
    suggested:sum(suggestions.map(s=>s.amount)),uncovered:unassigned.length?null:knownSum(remaining.map(r=>r.amount))};
}

/** Only include accounts whose balances and commitments are both known. */
export function knownBankAvailability(state:State,month:Month,includeArchived=true){
  const accounts=state.accounts.filter(a=>!a.restricted&&(includeArchived||!a.archived));
  const unassigned=month.lines.some(l=>l.kind!=='income'&&!l.reserveId&&!state.accounts.some(a=>a.id===l.accountId)&&pending(month,l)!==0);
  const rows=accounts.map(a=>({current:balance(month,aid(a.id)),required:obligations(month,aid(a.id))}));
  const known=rows.filter(row=>row.current!==null&&row.required!==null);
  // Unassigned commitments could affect any account, so there is no reliable subset.
  const amount=unassigned||!known.length?null:sum(known.map(row=>row.current!-row.required!));
  return {amount,partial:amount!==null&&known.length<accounts.length,knownCount:known.length,
    cause:!accounts.length?'Sem contas à ordem ativas.':unassigned?'Há compromissos sem conta.':
      rows.some(row=>row.required===null)?'Há valores por indicar no plano.':'Há saldos iniciais por indicar.'};
}
