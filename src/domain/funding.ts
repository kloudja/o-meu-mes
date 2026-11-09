import { activeEvents, balance, obligations, pending, plannedSource } from './engine';
import { aid, rid, type Month, type State } from './model';
import { knownSum, sum } from './validation';

export interface TransferRoute { source:string; destination:string; amount:number }
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
  const paidOutsidePlan=new Map<string,number>();
  const routeKey=(from:string,to:string)=>JSON.stringify([from,to]);
  for(const event of events){
    const from=Object.keys(event.deltas).find(key=>event.deltas[key]<0);
    if(!from?.startsWith('a:'))continue;
    if(event.type==='transfer'){
      const to=Object.keys(event.deltas).find(key=>event.deltas[key]>0);
      if(to?.startsWith('a:')){
        const key=routeKey(from,to);
        const outstanding=paidOutsidePlan.get(key)??0;
        if(outstanding>0)paidOutsidePlan.set(key,Math.max(0,outstanding+event.deltas[from]));
      }
    }else if(event.amount>0&&(event.type==='execution'||event.type==='total')){
      const line=event.line??month.lines.find(l=>l.id===event.lineId);
      if(line?.kind!=='expense'||line.reserveId||!line.accountId||aid(line.accountId)===from)continue;
      const key=routeKey(aid(line.accountId),from);
      paidOutsidePlan.set(key,sum([paidOutsidePlan.get(key)??0,event.amount,-(reductions.get(event.id)??0)]));
    }
  }
  // Allocate reimbursements first, while protecting the donor's own remaining plan.
  // Any other deficit uses the normal catalog order. Never allocate a surplus twice.
  if(!unassigned.length){
    for(const preferPlannedAccount of [true,false])for(const row of remaining){
      if(row.amount===null||row.amount===0||row.account.archived)continue;
      for(const donor of donors){
        const key=routeKey(aid(donor.account.id),aid(row.account.id));
        const preference=preferPlannedAccount?(paidOutsidePlan.get(key)??0):row.amount;
        const take=Math.min(row.amount,donor.available,preference);
        if(take>0){
          const route=suggestions.find(r=>r.source===donor.account&&r.destination===row.account);
          if(route)route.amount=sum([route.amount,take]);
          else suggestions.push({source:donor.account,destination:row.account,amount:take});
          donor.available-=take;row.amount-=take;
        }
        if(row.amount===0)break;
      }
    }
  }
  return {accounts,total:unassigned.length?null:knownSum(accounts.map(a=>a.transfer)),unassigned,reserves,suggestions,remaining,
    suggested:sum(suggestions.map(s=>s.amount)),uncovered:unassigned.length?null:knownSum(remaining.map(r=>r.amount))};
}

/** Only include accounts whose balances and commitments are both known. */
export function knownBankAvailability(state:State,month:Month,includeArchived=true){
  const accounts=state.accounts.filter(a=>!a.restricted&&(includeArchived||!a.archived));
  const unassigned=month.lines.some(l=>l.kind!=='income'&&!l.reserveId&&!state.accounts.some(a=>a.id===l.accountId)&&pending(month,l)!==0);
  const rows=accounts.map(a=>({current:balance(month,aid(a.id)),required:obligations(month,aid(a.id))}));
  const known=rows.filter(row=>row.current!==null&&row.required!==null);
  // A complete commitment total has already been validated by the domain.
  const amount=unassigned||!known.length||rows.some(row=>row.required===null)?null:sum(known.map(row=>row.current!-row.required!));
  return {amount,partial:amount!==null&&known.length<accounts.length,knownCount:known.length,
    cause:!accounts.length?'Sem contas à ordem ativas.':unassigned?'Há compromissos sem conta.':
      rows.some(row=>row.required===null)?'Há valores por indicar no plano.':'Há saldos iniciais por indicar.'};
}
