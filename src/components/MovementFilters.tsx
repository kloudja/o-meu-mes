import { useState } from 'react';
import { Dialog, Select } from './Dialog';
import { Icon } from './Icon';

type Order='name'|'plan'|'realized'|'pending'|'date';
type Group='none'|'category'|'bank'|'date';
type Status='all'|'pending'|'done'|'unplanned';
export interface MovementView {
  order:Order; descending:boolean; group:Group;
  status:Status; account:string; category:string; afterSnapshot:boolean;
}
export const defaultMovementView:MovementView={order:'name',descending:false,group:'none',status:'all',account:'',category:'',afterSnapshot:false};

type Option={id:string;name:string};
const allAccounts={id:'',name:'Todos os bancos'};
const allCategories={id:'',name:'Todas as categorias'};
const orders=[{id:'name',name:'Nome'},{id:'plan',name:'Plano atual'},{id:'realized',name:'Realizado'},{id:'pending',name:'Falta'},{id:'date',name:'Data'}];
const groups=[{id:'none',name:'Sem agrupamento'},{id:'category',name:'Categoria'},{id:'bank',name:'Banco'},{id:'date',name:'Data'}];
const statuses=[{id:'all',name:'Todos os estados'},{id:'pending',name:'Por realizar'},{id:'done',name:'Concluídos'},{id:'unplanned',name:'Valor por indicar'}];

export function ActiveMovementFilters({value,onRemove,accounts,categories}:{
  value:MovementView;onRemove:(view:MovementView)=>void;accounts:Option[];categories:Option[];
}){
  const name=(options:Option[],id:string)=>options.find(option=>option.id===id)?.name;
  const labels:Record<keyof MovementView,string|undefined>={
    order:`Ordenar por ${name(orders,value.order)}`,
    descending:'Ordem decrescente',
    group:`Agrupar por ${name(groups,value.group)?.toLocaleLowerCase('pt-PT')}`,
    status:name(statuses,value.status),
    account:name(accounts,value.account)??'Conta selecionada',
    category:name(categories,value.category)??'Categoria selecionada',
    afterSnapshot:'Adicionado depois do plano inicial',
  };
  const active=(Object.keys(labels) as (keyof MovementView)[]).filter(key=>value[key]!==defaultMovementView[key]);
  if(!active.length)return null;
  return <ul className="active-filters" aria-label="Filtros ativos">
    {active.map(key=><li key={key}>
      <button type="button" className="button small" aria-label={`Remover filtro: ${labels[key]}`}
        onClick={()=>onRemove({...value,[key]:defaultMovementView[key]})}>
        {labels[key]}<Icon name="close" size={14}/>
      </button>
    </li>)}
  </ul>;
}

export function MovementFilters({value,onApply,base=false,accounts,categories,hasSnapshot}: {
  value:MovementView;onApply:(view:MovementView)=>void;base?:boolean;accounts?:Option[];categories?:Option[];hasSnapshot?:boolean;
}){
  const [draft,setDraft]=useState<MovementView|null>(null);
  const set=<K extends keyof MovementView,>(key:K,next:MovementView[K])=>setDraft(current=>current&&({...current,[key]:next}));
  const count=Object.entries(defaultMovementView).filter(([key,initial])=>value[key as keyof MovementView]!==initial).length;
  const orderOptions=base?[orders[0],{...orders[1],name:'Previsto'}]:orders;
  const groupOptions=base?groups.filter(group=>group.id!=='date'):groups;
  const apply=(next:MovementView)=>{onApply(next);setDraft(null);};
  return <>
    <button className="button filter-button" type="button" aria-haspopup="dialog" onClick={()=>setDraft(value)}>
      <Icon name="filter" size={16}/>Filtros{count>0&&<span className="pill" aria-label={count===1?'1 opção ativa':`${count} opções ativas`}>{count}</span>}
    </button>
    {draft&&<Dialog title="Filtros de movimentos" eyebrow="VISTA DA LISTA" onClose={()=>setDraft(null)}>
      <form onSubmit={e=>{e.preventDefault();apply(draft);}}>
        <div className="dialog-body">
          <div className="form-two">
            <label>Ordenar por<Select data-initial-focus options={orderOptions} emptyLabel="Sem opções" value={draft.order} onChange={e=>set('order',e.target.value as Order)}/></label>
            <label>Ordem<Select options={[{id:'asc',name:'Crescente'},{id:'desc',name:'Decrescente'}]} emptyLabel="Sem opções" value={draft.descending?'desc':'asc'} onChange={e=>set('descending',e.target.value==='desc')}/></label>
          </div>
          <label>Agrupar por<Select options={groupOptions} emptyLabel="Sem opções" value={draft.group} onChange={e=>set('group',e.target.value as Group)}/></label>
          {accounts&&categories&&<>
            <div className="form-two">
              <label>Banco<Select options={[allAccounts,...accounts]} emptyLabel="Sem bancos" value={draft.account} onChange={e=>set('account',e.target.value)}/></label>
              <label>Categoria<Select options={[allCategories,...categories]} emptyLabel="Sem categorias" value={draft.category} onChange={e=>set('category',e.target.value)}/></label>
            </div>
            <label>Estado<Select options={statuses} emptyLabel="Sem opções" value={draft.status} onChange={e=>set('status',e.target.value as Status)}/></label>
            <label className="checkbox"><input type="checkbox" checked={!!hasSnapshot&&draft.afterSnapshot} disabled={!hasSnapshot}
              onChange={e=>set('afterSnapshot',e.target.checked)}/>Adicionado depois do plano inicial</label>
            {!hasSnapshot&&<small>Disponível depois de guardar o plano inicial do mês.</small>}
          </>}
        </div>
        <div className="dialog-footer movement-filter-footer">
          <button type="button" className="button" onClick={()=>apply(defaultMovementView)}>Limpar filtros</button>
          <button type="submit" className="button primary">Aplicar filtros</button>
        </div>
      </form>
    </Dialog>}
  </>;
}
