'use client';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
export function Dialog({title,onClose,children,demo=true,returnTo}:{title:string;onClose:()=>void;children:React.ReactNode;demo?:boolean;returnTo?:string}){
  const ref=useRef<HTMLDialogElement>(null);
  const backdropPress=useRef(false);
  const [previous]=useState(()=>document.activeElement as HTMLElement|null);
  useLayoutEffect(()=>{
    const dialog=ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return ()=>{
      dialog?.close();
      if(returnTo)document.getElementById(returnTo)?.focus({preventScroll:true});
      else if(previous?.isConnected)previous.focus({preventScroll:true});
    };
  },[previous,returnTo]);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={e=>{e.preventDefault();onClose();}} onKeyDown={e=>{
    if(e.key!=='Tab'||e.defaultPrevented)return;
    const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]'))
      .filter(el=>el.tabIndex>=0&&!el.matches(':disabled')&&el.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }} onPointerDown={e=>{backdropPress.current=e.target===e.currentTarget;}}
    onClick={e=>{if(backdropPress.current&&e.target===e.currentTarget)onClose();backdropPress.current=false;}}>
    <div className="dialog-head"><div><span className="eyebrow">{demo?'SIMULAÇÃO DO MÊS':'REGISTO LOCAL DO MÊS'}</span><h2 id="dialog-title">{title}</h2></div><button type="button" className="icon-button" aria-label="Fechar diálogo" onClick={onClose}><Icon name="close"/></button></div>
    {children}
  </dialog>;
}
export function Choice({label,name,options,value,onChange,required=false,invalid=false,error}:{label:string;name:string;options:{id:string;name:string}[];value:string;onChange:(v:string)=>void;required?:boolean;invalid?:boolean;error?:React.ReactNode}){
  const id=useId(),listId=`${id}-options`;
  const input=useRef<HTMLInputElement>(null),list=useRef<HTMLUListElement>(null);
  const [open,setOpen]=useState(false),[filter,setFilter]=useState(''),[draft,setDraft]=useState(''),[highlight,setHighlight]=useState(-1);
  const selected=options.find(option=>option.id===value);
  useLayoutEffect(()=>{if(open)list.current?.scrollIntoView({block:'nearest'});},[open]);
  const visible=options.filter(option=>option.name.toLocaleLowerCase('pt-PT').includes(filter.toLocaleLowerCase('pt-PT')));
  const showAll=()=>{setOpen(true);setFilter('');setHighlight(-1);};
  const choose=(id:string)=>{onChange(id);setDraft('');setOpen(false);};
  return <div className="choice" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    <label htmlFor={id}>{label}</label>
    <div className="choice-field">
      <input ref={input} id={id} name={name} role="combobox" aria-expanded={open} aria-controls={open?listId:undefined}
        aria-activedescendant={open&&visible[highlight]?`${listId}-${highlight}`:undefined} aria-autocomplete="list"
        autoComplete="off" placeholder="Pesquisar ou escolher…" value={selected?.name??draft} required={required}
        aria-invalid={invalid} aria-describedby={invalid?'form-error':undefined} onClick={()=>{if(!open)showAll();}}
        onChange={e=>{onChange('');setDraft(e.target.value);setFilter(e.target.value);setHighlight(-1);setOpen(true);}}
        onKeyDown={e=>{
          if(e.key==='Escape'&&open){e.preventDefault();setOpen(false);return;}
          if(e.key==='Enter'&&open&&visible[highlight]){e.preventDefault();choose(visible[highlight].id);return;}
          if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
          e.preventDefault();
          if(!open){showAll();setHighlight(e.key==='ArrowDown'?0:options.length-1);return;}
          const next=e.key==='ArrowDown'?Math.min(highlight+1,visible.length-1):Math.max(highlight-1,0);
          setHighlight(next);
          list.current?.children[next]?.scrollIntoView({block:'nearest'});
        }}/>
      <button type="button" className="choice-toggle" tabIndex={-1} aria-label={`Mostrar opções de ${label.toLocaleLowerCase('pt-PT')}`} onMouseDown={e=>e.preventDefault()} onClick={()=>{input.current?.focus();if(open)setOpen(false);else showAll();}}><Icon name="chevron" size={17}/></button>
      {open&&<ul ref={list} id={listId} className="choice-options" role="listbox" aria-label={label}>
        {visible.map((option,index)=><li key={option.id} id={`${listId}-${index}`} role="option" aria-selected={option.id===value} data-highlighted={highlight===index} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option.id)}>{option.name}{option.id===value&&<Icon name="check" size={15}/>}</li>)}
        {visible.length===0&&<li className="choice-empty" role="presentation">Sem resultados</li>}
      </ul>}
    </div>
    {error}
  </div>;
}
