export type Kind = 'expense' | 'income' | 'saving' | 'investment';
export interface Account { id:string; name:string; color:string; restricted:boolean; archived?:boolean }
export interface Category { id:string; name:string; archived?:boolean }
export interface Reserve { id:string; name:string; accountId:string }
export interface Line { id:string; name:string; kind:Kind; plan:number|null; accountId:string; categoryId:string; reserveId?:string; variable?:boolean; expenseModeRevision?:string }
export interface Catalog { accounts:Account[]; categories:Category[]; reserves:Reserve[] }
export interface Event {
  id:string; lineId?:string; amount:number; date:string; note:string; description?:string;
  type:'execution'|'total'|'transfer'|'adjustment'|'detail'|'saving'|'savingAssociation'; deltas:Record<string,number>;
  complete?:boolean; voided?:boolean; line?:Line; sourceNames?:Record<string,string>;
  allocations?:Record<string,number>; purchaseAmount?:number; corrects?:string; replacedBy?:string;
  reconciliation?:{source:string;calculated:number;observed:number};
  totalObservation?:{observed:number;realizedBefore:number;purchasesBefore:number};
  saving?:{reserveId:string;extra:number;transferId?:string};
  savingParentId?:string;
}
export interface Occurrence { id:string; definitionId:string; name:string; date:string; amount:number|null; accountId:string; reserveId?:string; state:'open'|'linked'|'dismissed'; lineId?:string }
export interface Recurring { id:string; name:string; date:string; frequency:'monthly'|'annual'; active:boolean; amount:number|null; accountId:string; reserveId?:string; reminderText?:string; reminderDays?:number }
export interface ExcelImport {
  file:string;
  sheet:string;
  sha256:string;
  allocations:{name:string; amount:number}[];
  cells:Record<string, {value:string|null; type:string; formula?:string; note?:string}>;
}
export interface Month { period:string; lines:Line[]; removedLines?:Line[]; initials:Record<string,number|null>; events:Event[]; occurrences:Occurrence[]; excelImport?:ExcelImport; snapshot?:{date:string; lines:Line[]; catalog:Catalog; reminderDates?:Record<string,string>} }
export interface State extends Catalog { base:Line[]; recurring:Recurring[]; months:Record<string,Month>; selected:string; requests:Record<string,string> }
export const aid = (id:string) => `a:${id}`;
export const rid = (id:string) => `r:${id}`;
