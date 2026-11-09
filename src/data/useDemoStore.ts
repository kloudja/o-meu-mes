'use client';
import { useRef, useState } from 'react';
import { examples } from './fixtures';
import { transact, type Action } from '../domain/engine';
import { newRequestId } from './requestId';
export function useDemoStore(){
  const [state,setState]=useState(examples);
  const current=useRef(state);
  function dispatch(action:Action,requestId=newRequestId()){
    const next=transact(current.current,action,requestId);
    current.current=next;setState(next);
  }
  function reset(){const next=examples();current.current=next;setState(next);}
  return {state,dispatch,reset};
}
