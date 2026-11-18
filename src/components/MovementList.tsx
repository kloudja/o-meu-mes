import { Fragment, useState, type ReactNode } from 'react';
import { pending, realized } from '@/domain/engine';
import { dateLabel } from '@/domain/money';
import { compareNames } from '@/domain/text';
import type { Line, Month } from '@/domain/model';
import { defaultMovementView, MovementFilters, type MovementView } from './MovementFilters';

type Column='name'|'plan'|'realized'|'pending';
export function MovementList({lines,month,base,categoryOf,bankOf,dateOf,renderRow,empty,view}: {
  lines:Line[];month:Month;base:boolean;categoryOf:(line:Line)=>string|undefined;bankOf:(line:Line)=>string|undefined;
  dateOf:(line:Line)=>string|undefined;renderRow:(line:Line)=>ReactNode;empty:ReactNode;
  view?:{value:MovementView;onChange:(next:MovementView)=>void};
}){
  const [ownView,setOwnView]=useState(defaultMovementView);
  const activeView=view?.value??ownView;
  const updateView=view?.onChange??setOwnView;
  const {order:column,descending,group}=activeView;
  const direction=descending?-1:1;
  const columns:[Column,string][]=base?[['name','Movimento / conta'],['plan','Previsto']]:[
    ['name','Movimento / conta'],['plan','Plano atual'],['realized','Realizado'],['pending','Falta'],
  ];
  const order=(a:Line,b:Line)=>{
    if(column==='name')return direction*compareNames(a.name,b.name);
    if(column==='date'){
      const left=dateOf(a),right=dateOf(b);
      return left&&right?direction*left.localeCompare(right)||compareNames(a.name,b.name):Number(!left)-Number(!right)||compareNames(a.name,b.name);
    }
    const numeric=(line:Line)=>column==='plan'?line.plan:column==='realized'?realized(month,line.id):pending(month,line);
    const left=numeric(a),right=numeric(b);
    if(left===null||right===null)return Number(left===null)-Number(right===null)||compareNames(a.name,b.name);
    return direction*Math.sign(left-right)||compareNames(a.name,b.name);
  };
  const groups=new Map<string,Line[]>();
  for(const line of [...lines].sort(order)){
    const key=(group==='category'?categoryOf(line):group==='bank'?bankOf(line):group==='date'?dateOf(line):'')??'';
    const rows=groups.get(key)??[];
    rows.push(line);
    groups.set(key,rows);
  }
  const orderedGroups=[...groups].sort(([a],[b])=>Number(!a)-Number(!b)||compareNames(a,b));
  const groupLabel=(key:string)=>key?(group==='date'?dateLabel(key):key):group==='category'?'Sem categoria':group==='bank'?'Sem banco':'Sem data';
  return <div className="line-list">
    {!view&&lines.length>0&&<div className="movement-options"><MovementFilters value={ownView} onApply={setOwnView} base={base}/></div>}
    <div className={`list-columns movement-columns${base?' base-columns':''}`}>
      {columns.map(([key,label])=>{
        const active=column===key;
        return <button key={key} type="button" className="sort-column" disabled={!lines.length}
          aria-label={active?`${label}, ordem ${descending?'decrescente':'crescente'}`:label}
          onClick={()=>updateView({...activeView,order:key,descending:active&&!descending})}>
          {label}<span className={active?'sort-indicator':undefined} aria-hidden="true">{active?(descending?'↓':'↑'):'↕'}</span>
        </button>;
      })}
      <span>Ações</span>
    </div>
    {!lines.length&&empty}
    {orderedGroups.map(([key,rows])=><Fragment key={key}>
      {group!=='none'&&<h3 className="movement-group">{groupLabel(key)}</h3>}{rows.map(renderRow)}
    </Fragment>)}
  </div>;
}
