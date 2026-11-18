'use client';
import { commandMessages } from '../i18n/command-messages.pt-PT';
import { useEffect, useRef, useState } from 'react';
import type { State } from '../domain/model';
import { canonical, type Action } from '../domain/actions';
import { DomainError } from '../domain/validation';
import type { Command, Confirmed } from '../contracts/command';
import { newRequestId } from './requestId';
const ATTEMPT='omeumes.pending.v1:';
function readAttempt(prefix:string):Command|null{
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix)){const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw);}}
  return null;
}
export function usePersistentStore(recoveryScope?:string){
  const prefix=recoveryScope?`omeumes.recovery.${recoveryScope}.pending.v1:`:ATTEMPT;
  const attemptKey=(c:Command)=>prefix+JSON.stringify([c.period,c.requestId]);
  const [confirmed,setConfirmed]=useState<Confirmed|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
  const current=useRef<Confirmed|null>(null),pending=useRef<Command|null>(null),flight=useRef<Promise<void>|null>(null);
  const selected=useRef<string|undefined>(undefined);
  function accept(result:Confirmed,period?:string){
    if(current.current&&result.revision<current.current.revision)return;
    const selection=period??selected.current??result.state.selected;
    if(result.state.months[selection])result.state.selected=selection;
    selected.current=result.state.selected;current.current=result;setConfirmed(result);
  }
  async function refresh(){
    try{
      const period=selected.current;
      const r=await fetch(`/api/state${period?`?period=${period}`:''}`,{cache:'no-store'});
      const data=await r.json();if(!r.ok)throw new Error(data.message);accept(data);setError('');return current.current!;
    }
    catch(e){setError((e as Error).message||commandMessages.openFailed);return false;}
  }
  useEffect(()=>{
    const recover=()=>{if(flight.current)return;try{pending.current=readAttempt(prefix);setUncertain(!!pending.current);}catch{setError(commandMessages.readAttemptFailed);}};
    recover();
    void refresh();
    window.addEventListener('storage',recover);
    const update=()=>{if(!flight.current)void refresh();};
    window.addEventListener('focus',update);const timer=window.setInterval(update,5000);
    return()=>{window.removeEventListener('focus',update);window.removeEventListener('storage',recover);window.clearInterval(timer);};
  // Refresh reads current refs; it never captures an old period/revision.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[prefix]);
  function clear(){if(pending.current)localStorage.removeItem(attemptKey(pending.current));pending.current=readAttempt(prefix);setUncertain(!!pending.current);}
  function send(command:Command){
    if(flight.current)return flight.current;
    setBusy(true);setError('');
    const work=(async()=>{
      // Install flight before synchronous browser-storage errors can reach finally.
      await Promise.resolve();
      try{
        // Persist only the unresolved attempt identity/content, never a financial database.
        try{localStorage.setItem(attemptKey(command),JSON.stringify(command));}catch{throw new Error(commandMessages.storeAttemptFailed);}
        pending.current=command;
        let response:Response;
        try{response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)});}catch{setUncertain(true);throw new Error(commandMessages.uncertain);}
        const data=await response.json();
        if(!response.ok){
          if(response.status>=500){setUncertain(true);throw new Error(data.message);}
          clear();
          throw new DomainError(data.code,data.message);
        }
        accept(data,command.action.type==='month'?command.action.period:selected.current);clear();
      }catch(e){if(pending.current)setUncertain(true);throw e;}
      finally{flight.current=null;setBusy(false);}
    })();flight.current=work;return work;
  }
  function dispatch(action:Action,requestId=newRequestId(),revision?:number){
    if(flight.current){
      if(pending.current?.requestId===requestId&&canonical(pending.current.action)===canonical(action))return flight.current;
      throw new Error(commandMessages.waitForConfirmation);
    }
    let outstanding:Command|null;
    try{outstanding=pending.current??readAttempt(prefix);}catch{throw new Error(commandMessages.readPendingFailed);}
    if(outstanding){pending.current=outstanding;setUncertain(true);throw new Error(commandMessages.resolvePending);}
    if(!current.current)throw new Error(commandMessages.waitForOpening);
    return send({period:current.current.state.selected,revision:revision??current.current.revision,requestId,action});
  }
  function retry(){if(!pending.current)return Promise.resolve();return send(pending.current);}
  return {state:confirmed?.state as State|undefined,revision:confirmed?.revision,getRevision:()=>current.current?.revision,dispatch,busy,uncertain,error,refresh,retry};
}
