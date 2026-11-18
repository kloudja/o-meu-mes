import { dateLabel, money } from '@/modules/finance/domain/money';
import type { accountFunding } from '@/modules/finance/domain/funding';

type Reasons=ReturnType<typeof accountFunding>['reimbursements'][number]['reasons'];

export function PaymentReasons({reasons,limit,dates}:{reasons:Reasons;limit?:number;dates?:ReadonlyMap<string,string>}){
  let remaining=limit??Infinity;
  return <ul className="payment-reasons">{reasons.map(reason=>{
    const amount=Math.min(reason.amount,remaining);
    remaining-=amount;
    const date=dates?.get(reason.id);
    return amount>0?<li key={reason.id}>{date&&<><time dateTime={date}>{dateLabel(date)}</time> · </>}{reason.name}{reason.description&&` · ${reason.description}`}{reason.category&&` · ${reason.category}`} ({money(amount)})</li>:null;
  })}</ul>;
}
