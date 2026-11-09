import { expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { migrate, connect } from '../../src/server/storage.mjs';
import { Repository, persist, type Command } from '../../src/server/repository';
import { examples } from '../../src/data/fixtures';
import { balance, realized, type Action } from '../../src/domain/engine';
const P='2026-11',A='a:act-r',B='a:act-s';
const pay=(amount:number):Action=>({type:'execute',lineId:'food',amount,source:A,date:`${P}-02`,complete:false});
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p;}
async function start(path:string){
  const p=await port(),url=`http://127.0.0.1:${p}`;
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(p)],{cwd:resolve('.'),env:{...process.env,OMEUMES_DB_PATH:path,OMEUMES_TEST_MODE:'1',NEXT_TELEMETRY_DISABLED:'1'},stdio:'pipe',windowsHide:true});
  let diagnostic='';child.stderr?.on('data',b=>{diagnostic+=b.toString();});child.stdout?.on('data',()=>{});
  for(let i=0;i<150;i++){try{const r=await fetch(url+'/api/state');if(r.ok)return {child,url};}catch{}if(child.exitCode!==null)throw new Error(`Server failed: ${diagnostic}`);await new Promise(r=>setTimeout(r,100));}
  child.kill();throw new Error('Server did not start');
}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}
function fixture(s=examples()){
  const path=join(mkdtempSync(join(tmpdir(),'omeumes-test-server-')),'server.sqlite');migrate(path);const db=connect(path);db.exec('BEGIN IMMEDIATE');persist(db,s);db.exec('COMMIT');db.close();return path;
}
async function post(url:string,c:Command){return fetch(url+'/api/state',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:JSON.stringify(c)});}
it('encerrar efetivamente o servidor e reabrir conserva eventos, snapshot, alocações, saldos e recibos',async()=>{
  const path=fixture(),repo=new Repository(path);let server=await start(path);
  const send=async(action:Action,id:string)=>{const c={period:P,requestId:id,revision:repo.read(P).revision,action};const r=await post(server.url,c);expect(r.status,await r.clone().text()).toBe(200);return c;};
  try{
    await send({type:'snapshot',date:`${P}-03`},'snap');await send(pay(4000),'buy');await send({...pay(6000),total:true} as Action,'total');const detail=await send({...pay(1000),includedInTotal:'total'} as Action,'detail');
    const before=repo.read(P);await stop(server.child);server=await start(path);
    const state=await (await fetch(server.url+'/api/state?period='+P)).json();expect(state).toEqual(before);
    const retry=await (await post(server.url,detail)).json();expect(retry.replay).toBe(true);expect(retry.state.months[P].events).toHaveLength(3);expect(retry.state.months[P].events[2].allocations).toEqual({total:1000});expect(balance(retry.state.months[P],A)).toBe(89000);expect(realized(retry.state.months[P],'food')).toBe(6000);
  }finally{await stop(server.child);}
});
it('dois processos concorrentes usam o mesmo bloqueio SQLite e não gastam saldo antigo',async()=>{
  const s=examples();s.months[P].initials[A]=10000;const path=fixture(s),repo=new Repository(path),one=await start(path),two=await start(path);
  try{
    const c={period:P,requestId:'one',revision:repo.read(P).revision,action:pay(8000)};
    const responses=await Promise.all([post(one.url,c),post(two.url,{...c,requestId:'two'})]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect(balance(repo.read(P).state.months[P],A)).toBe(2000);
    const winner=responses[0].ok?'one':'two';const replay=await Promise.all([post(one.url,{...c,requestId:winner}),post(two.url,{...c,requestId:winner})]);expect(replay.every(r=>r.ok)).toBe(true);expect(repo.read(P).state.months[P].events).toHaveLength(1);
    const retry=await post(two.url,{...c,requestId:'three',revision:repo.read(P).revision});expect(retry.status).toBe(422);expect(balance(repo.read(P).state.months[P],A)).toBe(2000);
    const snap={period:P,requestId:'snapshot-one',revision:repo.read(P).revision,action:{type:'snapshot',date:`${P}-03`} as Action};const snapshots=await Promise.all([post(one.url,snap),post(two.url,{...snap,requestId:'snapshot-two'})]);expect(snapshots.map(r=>r.status).sort()).toEqual([200,409]);expect(repo.read(P).state.months[P].snapshot?.date).toBe(`${P}-03`);
    const same={period:P,requestId:'new-same-key',revision:repo.read(P).revision,action:pay(500)};const sameResponses=await Promise.all([post(one.url,same),post(two.url,same)]);expect(sameResponses.every(r=>r.status===200)).toBe(true);const sameResults=await Promise.all(sameResponses.map(r=>r.json()));expect(sameResults.map(r=>r.replay).sort()).toEqual([false,true]);expect(balance(repo.read(P).state.months[P],A)).toBe(1500);expect(repo.read(P).state.months[P].events).toHaveLength(2);
    const open={period:P,requestId:'new-month-one',revision:repo.read(P).revision,action:{type:'month',period:'2026-12'} as Action};const openings=await Promise.all([post(one.url,open),post(two.url,{...open,requestId:'new-month-two'})]);expect(openings.map(r=>r.status).sort()).toEqual([200,409]);const retryKey=openings[0].ok?'new-month-two':'new-month-one';expect((await post(two.url,{...open,requestId:retryKey,revision:repo.read(P).revision})).status).toBe(200);const december=repo.read('2026-12').state.months['2026-12'];expect(december.events).toEqual([]);expect(Object.values(december.initials).every(v=>v===null)).toBe(true);expect(Object.keys(repo.read().state.months)).toHaveLength(2);
    expect(december.occurrences.map(o=>o.id)).toEqual(['google:2026-12']);
    expect(december.lines.map(l=>l.id)).toEqual(examples().base.map(l=>l.id));
    const reminder:Command={period:'2026-12',requestId:'reminder-one',revision:repo.read().revision,action:{type:'occurrence',mode:'add',id:'google:2026-12'}};
    const additions=await Promise.all([post(one.url,reminder),post(two.url,{...reminder,requestId:'reminder-two'})]);
    expect(additions.map(r=>r.status).sort()).toEqual([200,409]);
    const retryReminder={...reminder,requestId:additions[0].ok?'reminder-two':'reminder-one',revision:repo.read().revision};
    expect((await post(two.url,retryReminder)).status).toBe(422);
    const treated=repo.read('2026-12').state.months['2026-12'];
    expect(treated.lines.filter(l=>l.id==='occ:google:2026-12').map(l=>l.plan)).toEqual([199]);
    expect(treated.events).toEqual([]);
    expect(treated.initials).toEqual(december.initials);
  }finally{await stop(one.child);await stop(two.child);}
});
