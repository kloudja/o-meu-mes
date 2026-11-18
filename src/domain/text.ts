const normalize=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-PT');
export const matchesText=(text:string,query:string)=>normalize(text).includes(normalize(query.trim()));
export const compareNames=new Intl.Collator('pt-PT',{sensitivity:'base',numeric:true}).compare;
