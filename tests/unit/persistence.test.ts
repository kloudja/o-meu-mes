import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate, migrations, connect, databasePath } from '../../src/server/storage.mjs';
import { Repository, persist, type Command, type Fault } from '../../src/server/repository';
import { handleGet, handlePost } from '../../src/server/http';
import { examples } from '../../src/data/fixtures';
import { activeEvents, balance, completed, pending, previousSavingBalance, realized, type Action, type FinancialAction } from '../../src/domain/engine';
import type { State } from '../../src/domain/model';
const A='a:act-r',B='a:act-s',M='a:moey-r',R='r:em',P='2026-11';
let sequence=0;
function path(){return join(mkdtempSync(join(tmpdir(),'omeumes-test-')),'test.sqlite');}
function fixture(state=examples()){
  const p=path();migrate(p);const db=connect(p);
  db.exec('BEGIN IMMEDIATE');persist(db,state);db.exec('COMMIT');db.close();
  return new Repository(p);
}
function command(r:Repository,action:Action,key=`test-${++sequence}`,period=P,revision=r.read(period).revision):Command{return {period,requestId:key,revision,action};}
function act(r:Repository,action:Action,key?:string,period=P){return r.command(command(r,action,key,period)).state;}
const pay=(amount=4000,lineId='food',source=A,extra:Partial<Extract<FinancialAction,{type:'execute'}>>={}):Extract<FinancialAction,{type:'execute'}>=>({type:'execute',lineId,amount,source,date:`${P}-02`,complete:false,...extra});
const obs=(amount:number)=>({type:'reconcile' as const,source:A,amount,date:`${P}-02`,note:'Conferência fictícia'});
const month=(s:State)=>s.months[P];
function unchanged(r:Repository,a:Action,match?:string){const before=r.read();expect(()=>act(r,a)).toThrow(match);expect(r.read()).toEqual(before);}
function request(body:unknown,origin='http://127.0.0.1:3999'){return new Request('http://127.0.0.1:3999/api/state',{method:'POST',headers:{origin,host:'127.0.0.1:3999','content-type':'application/json'},body:JSON.stringify(body)});}
afterEach(()=>{delete process.env.OMEUMES_TEST_MODE;delete process.env.OMEUMES_DB_PATH;});

it('elimina apenas a conta sem referências e os seus saldos por indicar numa transação repetível',()=>{
  const r=fixture(),account={id:'unused',name:'Conta fictícia sem uso',color:'#7a9c8c',restricted:false};
  act(r,{type:'account',account});
  act(r,{type:'month',period:'2026-12'});
  act(r,{type:'snapshot',date:'2026-11-02'});
  const before=r.read();
  const deletion=command(r,{type:'deleteAccount',id:account.id},'delete-unused');
  const failing=new Repository(r.path,stage=>{if(stage==='commit')throw new Error('Falha de teste');});
  expect(()=>failing.command(deletion)).toThrow('Falha de teste');
  expect(r.read()).toEqual(before);
  r.command(deletion);
  expect(r.command(deletion).replay).toBe(true);
  migrate(r.path);
  const after=new Repository(r.path).read().state;
  expect(after.accounts).toEqual(before.state.accounts.filter(a=>a.id!==account.id));
  for(const [period,m] of Object.entries(after.months)){
    const {'a:unused':_,...initials}=before.state.months[period].initials;
    expect(m).toEqual({...before.state.months[period],initials});
  }
  unchanged(r,{type:'deleteAccount',id:'act-r'},'tem saldos');
  act(r,{type:'initial',source:'a:bank',amount:0});
  unchanged(r,{type:'deleteAccount',id:'bank'},'tem saldos');
});

describe('Ajustes da experimentação em SQLite',()=>{
  const reinforcement=(amount:number,lineId?:string,source=M):Action=>({type:'save',reserveId:'em',lineId,source,amount,date:P+'-05'});
  function savingFixture(){
    const state=examples();
    Object.assign(month(state).initials,{[A]:50000,[M]:20000,[R]:10000});
    return fixture(state);
  }

  it('distingue objetivo e reforço extra e associa sem novo efeito financeiro',()=>{
    const r=savingFixture();
    act(r,reinforcement(4000,'save-em'),'goal');
    act(r,reinforcement(3000),'extra');
    const progress=()=>{
      const m=month(new Repository(r.path).read(P).state),goal=m.lines.find(l=>l.id==='save-em')!;
      return [realized(m,goal.id),pending(m,goal),balance(m,M),balance(m,R)];
    };
    expect(progress()).toEqual([4000,6000,13000,17000]);
    const association:Action={type:'associateSaving',lineId:'save-em',eventId:'extra',amount:2000};
    const request=command(r,association,'association');
    r.command(request);
    expect(r.command(request).replay).toBe(true);
    unchanged(r,{...association,amount:1000},'já tem uma associação');
    expect(progress()).toEqual([6000,4000,13000,17000]);
    expect(month(r.read(P).state).events.at(-1)).toMatchObject({id:'association',date:P+'-05',type:'savingAssociation',amount:2000,deltas:{}});
    act(r,{type:'void',id:'association'});
    expect(progress()).toEqual([4000,6000,13000,17000]);
    act(r,association,'association-2');
    act(r,{type:'void',id:'extra'});
    expect(progress()).toEqual([4000,6000,16000,14000]);
    expect(month(r.read(P).state).events.find(e=>e.id==='association-2')?.voided).toBe(true);
  });

  it('grava os dois movimentos entre bancos uma vez e reverte os dois perante falha ou anulação',()=>{
    const r=savingFixture(),c=command(r,reinforcement(4000,'save-em',A),'cross-bank');
    const before=r.read(P);
    const db=connect(r.path);
    db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON events WHEN NEW.id='cross-bank' BEGIN SELECT RAISE(ABORT,'falha no segundo registo'); END");
    try{
      expect(()=>r.command(c)).toThrow('falha no segundo registo');
      expect(r.read(P)).toEqual(before);
    }finally{db.exec('DROP TRIGGER fail_second');db.close();}
    expect(()=>new Repository(r.path,stage=>{if(stage==='response')throw new Error('Resposta perdida');}).command(c)).toThrow('Resposta perdida');
    expect(r.command(c).replay).toBe(true);
    const saved=month(new Repository(r.path).read(P).state);
    expect(saved.events.map(e=>[e.type,e.amount,e.deltas])).toEqual([
      ['transfer',0,{[A]:-4000,[M]:4000}],
      ['saving',4000,{[M]:-4000,[R]:4000}]
    ]);
    expect([A,M,R].map(k=>balance(saved,k))).toEqual([46000,20000,14000]);
    act(r,reinforcement(7000,'save-em'),'surplus');
    const withSurplus=month(new Repository(r.path).read(P).state);
    expect(withSurplus.events.at(-1)).toMatchObject({amount:6000,saving:{extra:1000},deltas:{[M]:-7000,[R]:7000}});
    act(r,{type:'void',id:'cross-bank:transfer'});
    const after=month(r.read(P).state);
    expect(activeEvents(after).map(e=>e.id)).toEqual(['surplus']);
    expect([A,M,R].map(k=>balance(after,k))).toEqual([50000,13000,17000]);
    expect(realized(after,'save-em')).toBe(6000);
  });

  it('sugere o último saldo só para o mês seguinte e conserva o inicial na conferência',()=>{
    const r=savingFixture(),next='2026-12';
    act(r,reinforcement(4000,'save-em',A));
    act(r,{type:'month',period:next});
    let state=new Repository(r.path).read(next).state;
    expect(previousSavingBalance(state,state.months[next],'em')).toEqual({period:P,amount:14000});
    expect(state.months[next].initials[R]).toBeNull();
    expect(state.months[next].events).toEqual([]);
    act(r,{type:'initial',source:R,amount:13500},undefined,next);
    act(r,{type:'reconcile',source:R,amount:15000,date:next+'-03',note:'Conferência fictícia'},undefined,next);
    state=new Repository(r.path).read(next).state;
    expect(state.months[next].initials[R]).toBe(13500);
    expect(balance(state.months[next],R)).toBe(15000);
    expect(state.months[next].events.at(-1)).toMatchObject({date:next+'-03',deltas:{[R]:1500},reconciliation:{calculated:13500,observed:15000}});
    expect(balance(state.months[P],R)).toBe(14000);
    act(r,{type:'month',period:'2027-02'},undefined,next);
    state=r.read('2027-02').state;
    expect(previousSavingBalance(state,state.months['2027-02'],'em')).toBeNull();
  });

  it('grava criação e execução juntas e mantém registos e referência ao mudar de tipo',()=>{
    const r=savingFixture();
    const rent=month(r.read(P).state).lines.find(l=>l.id==='rent')!;
    const immediate={type:'line',line:{...rent,id:'paid',plan:4000},execution:{amount:4000,source:A,date:P+'-06'}} as const;
    unchanged(r,{...immediate,execution:{...immediate.execution,amount:60000}},'disponíveis');
    act(r,immediate,'paid-execution');
    act(r,{...immediate,line:{...immediate.line,id:'received',kind:'income'}},'income-execution');
    act(r,{type:'snapshot',date:P+'-07'});
    let m=month(r.read(P).state);
    expect(m.events.map(e=>[e.lineId,e.amount,e.deltas])).toEqual([['paid',4000,{[A]:-4000}],['received',4000,{[A]:4000}]]);
    expect(balance(m,A)).toBe(50000);
    expect(completed(m,'paid')).toBe(true);
    const snapshot=m.snapshot;
    const paid=m.lines.find(l=>l.id==='paid')!;
    act(r,{type:'line',line:{...paid,variable:true,plan:10000}},'change-to-budget');
    act(r,pay(1000,'paid',A,{description:'Compra fictícia'}),'purchase-after-change');
    act(r,pay(6000,'paid',A,{total:true}),'accumulated-after-change');
    act(r,{type:'line',line:{...paid,variable:false,plan:10000}},'change-to-payment');
    act(r,pay(1500,'paid',M),'first-instalment');
    m=month(r.read(P).state);
    expect([realized(m,'paid'),pending(m,m.lines.find(l=>l.id==='paid')!),completed(m,'paid')]).toEqual([7500,2500,false]);
    act(r,pay(2500,'paid',M),'last-instalment');
    m=month(new Repository(r.path).read(P).state);
    expect([realized(m,'paid'),completed(m,'paid'),balance(m,A),balance(m,M)]).toEqual([10000,true,48000,16000]);
    expect(m.events.map(e=>[e.type,e.amount])).toEqual([['execution',4000],['execution',4000],['execution',1000],['total',1000],['execution',1500],['execution',2500]]);
    expect(m.snapshot).toEqual(snapshot);
  });
});

describe('Migrações e isolamento físico',()=>{
  it('base nova só tem metadados confirmados e mês vazio; reaplicar não duplica',()=>{
    const p=path();const info=migrate(p);expect(info.version).toBe(3);const r=new Repository(p),before=r.read();
    expect(before.state.accounts).toHaveLength(6);expect(before.state.categories).toHaveLength(14);
    expect(before.state.base).toEqual([]);expect(before.state.reserves).toEqual([]);expect(before.state.recurring).toEqual([]);
    expect(Object.values(before.state.months).every(m=>!m.events.length&&!m.lines.length&&!m.snapshot&&Object.values(m.initials).every(v=>v===null))).toBe(true);
    migrate(p);expect(r.read()).toEqual(before);
  });
  it('migra versão 1 preservando registos; versão futura falha sem reset',()=>{
    const p=path();migrate(p,migrations.slice(0,1));const db=connect(p);db.prepare('INSERT INTO receipts VALUES(?,?,?)').run('test','retained','{}');db.close();
    migrate(p);const check=connect(p);expect(check.prepare('SELECT canonical FROM receipts').get()?.canonical).toBe('{}');check.exec('PRAGMA user_version=99');check.close();
    expect(()=>migrate(p)).toThrow('Incompatible');const again=new DatabaseSync(p);expect(again.prepare('SELECT canonical FROM receipts').get()?.canonical).toBe('{}');again.close();
  });
  it('falha de migração reverte versão e DDL, preservando dados',()=>{
    const p=path();migrate(p,migrations.slice(0,1));expect(()=>migrate(p,[...migrations,'CREATE TABLE partial(id INTEGER); INVALID SQL;'])).toThrow();
    const db=connect(p);expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(1);expect(db.prepare("SELECT name FROM sqlite_schema WHERE name='partial'").get()).toBeUndefined();expect(db.prepare('SELECT count(*) AS n FROM accounts').get()?.n).toBe(6);db.close();
  });
  it('ficheiro inválido e SQLite alheio não são substituídos',()=>{
    const p=path();writeFileSync(p,'conteúdo a preservar');expect(()=>migrate(p)).toThrow();expect(readFileSync(p,'utf8')).toBe('conteúdo a preservar');
    const q=path(),db=new DatabaseSync(q);db.exec('CREATE TABLE foreign_data(id INTEGER); INSERT INTO foreign_data VALUES(7)');db.close();expect(()=>migrate(q)).toThrow('Incompatible');
    const check=new DatabaseSync(q);expect(check.prepare('SELECT * FROM foreign_data').get()?.id).toBe(7);check.close();
  });
  it('ligações verificam WAL, FULL, foreign_keys, inteiro seguro e referências mensais',()=>{
    const r=fixture(),db=connect(r.path);expect(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe('wal');expect(db.prepare('PRAGMA synchronous').get()?.synchronous).toBe(2);expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
    expect(()=>db.prepare('UPDATE initials SET amount=? WHERE period=? AND source=?').run(9007199254740992n,P,A)).toThrow();
    expect(()=>db.prepare('INSERT INTO effects VALUES(?,?,?,?)').run('2026-12','unknown',A,-10)).toThrow();expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);db.close();
  });
  it('modo de teste rejeita base local e caminhos relativos',()=>{
    process.env.OMEUMES_TEST_MODE='1';expect(()=>databasePath()).toThrow('Test database');process.env.OMEUMES_DB_PATH='relative.sqlite';expect(()=>databasePath()).toThrow('absolute');process.env.OMEUMES_DB_PATH=path();expect(databasePath()).toContain('omeumes-test-');
  });
});

describe('Comandos duráveis — expectativas independentes',()=>{
  it('1000/0 → reforço 100 → 900/100; compra 40 → 900/60 e gasto 40; dependências e devolução',()=>{
    const s=examples();month(s).initials[M]=100000;month(s).initials[R]=0;const r=fixture(s);
    act(r,pay(10000,'save-em',M),'saving');let state=act(r,pay(4000,'health',R),'purchase');
    expect(balance(month(state),M)).toBe(90000);expect(balance(month(state),R)).toBe(6000);expect(realized(month(state),'health')).toBe(4000);
    const reopened=new Repository(r.path);expect(reopened.read(P).state).toEqual(state);
    unchanged(reopened,{type:'void',id:'saving'},'negativa');act(r,{type:'void',id:'purchase'});state=act(r,{type:'void',id:'saving'});expect(balance(month(state),M)).toBe(100000);expect(balance(month(state),R)).toBe(0);
    act(r,{type:'transfer',source:M,destination:R,amount:5000,date:`${P}-03`});state=act(r,{type:'transfer',source:R,destination:M,amount:2000,date:`${P}-03`});expect(balance(month(state),M)).toBe(97000);expect(balance(month(state),R)).toBe(3000);
  });
  it('observação 55 depois de 100−40 dá −5; compra 10 e correção para 58 deixa 48',()=>{
    const s=examples();month(s).initials[A]=10000;const r=fixture(s);act(r,pay(4000),'buy');act(r,obs(5500),'bank');act(r,pay(1000),'later');
    act(r,{type:'correct',id:'bank',replacement:obs(5800)},'correction');const state=new Repository(r.path).read(P).state;
    expect(balance(month(state),A)).toBe(4800);expect(month(state).initials[A]).toBe(10000);expect(month(state).events.at(-1)?.reconciliation).toEqual({source:A,calculated:6000,observed:5800});expect(month(state).events[1].replacedBy).toBe('correction');
  });
  it('snapshot 100, atual 120, realizado 40: inicial 100 e falta 80; nomes, arquivo e remoção',()=>{
    const r=fixture();act(r,{type:'snapshot',date:`${P}-03`});const original=r.read(P).state;
    act(r,{type:'line',line:{...month(original).lines.find(l=>l.id==='services')!,plan:12000}});let s=act(r,pay(4000,'services'),'pay');
    expect(month(s).snapshot?.lines.find(l=>l.id==='services')?.plan).toBe(10000);expect(pending(month(s),month(s).lines.find(l=>l.id==='services')!)).toBe(8000);
    act(r,{type:'account',account:{...s.accounts[0],name:'Nome revisto',archived:true}});act(r,{type:'category',category:{...s.categories[0],name:'Categoria revista',archived:true}});
    act(r,{type:'line',line:{...month(s).lines.find(l=>l.id==='services')!,id:'after',plan:3000,accountId:'act-s'}});act(r,{type:'void',id:'pay'});s=act(r,{type:'removeLine',id:'services'});
    const reopened=new Repository(r.path).read(P).state;expect(reopened).toEqual(s);expect(month(s).removedLines?.some(l=>l.id==='services')).toBe(true);expect(month(s).snapshot?.catalog.accounts[0].name).toBe('ActivoBank A');expect(month(s).events[0].sourceNames?.[A]).toBe('ActivoBank A');
    const db=connect(r.path);expect(()=>db.prepare('UPDATE snapshots SET payload=? WHERE period=?').run('{}',P)).toThrow('immutable');expect(()=>db.prepare('DELETE FROM snapshots WHERE period=?').run(P)).toThrow('immutable');db.close();
    unchanged(r,{type:'snapshot',date:`${P}-04`},'já foi guardado');
  });
  it('compras 40, total 60, posterior 10; corrigir total antigo para 65 dá 75; detalhe e dependências',()=>{
    const r=fixture();act(r,pay(4000),'p1');act(r,pay(6000,'food',B,{total:true}),'total');act(r,pay(1000),'later');
    act(r,{type:'correct',id:'total',replacement:pay(6500,'food',B,{total:true})},'corrected');let s=new Repository(r.path).read(P).state;
    expect(realized(month(s),'food')).toBe(7500);expect(balance(month(s),A)).toBe(90000);expect(balance(month(s),B)).toBe(22500);
    unchanged(r,pay(6500,'food',A,{total:true}),'origem não financiou');
    s=act(r,pay(1000,'food',B,{includedInTotal:'corrected',description:'Detalhe fictício'}),'detail');expect(realized(month(s),'food')).toBe(7500);expect(balance(month(s),B)).toBe(22500);
    unchanged(r,{type:'void',id:'corrected'},'dependentes');expect(new Repository(r.path).read(P).state.months[P].events.at(-1)?.allocations).toEqual({corrected:1000});
  });
  it('iniciais e operação são conjuntos; erro não grava inicial nem recibo; conhecido não substituído',()=>{
    const r=fixture();act(r,{type:'month',period:'2026-12'});const action={...pay(10000,'save-em',M,{initials:{[M]:5000,[R]:0}}),date:'2026-12-02'};
    const c=command(r,action,'joint','2026-12');const before=r.read('2026-12');expect(()=>r.command(c)).toThrow('disponíveis');expect(r.read('2026-12')).toEqual(before);
    const good={...c,action:{...action,initials:{[M]:100000,[R]:0}}};r.command(good);expect(balance(r.read('2026-12').state.months['2026-12'],M)).toBe(90000);
    unchanged(r,pay(1,'services',A,{initials:{[A]:99999}}),'já indicado');
  });
  it.each(['catalog','initials','events','receipt','commit'] as const)('falha em %s reverte todas as tabelas e recibo',stage=>{
    const r=fixture();act(r,{type:'month',period:'2026-12'});const before=r.read('2026-12');const broken=new Repository(r.path,s=>{if(s===stage)throw new Error('injected');});
    const a={...pay(10000,'save-em',M,{initials:{[M]:100000,[R]:0}}),date:'2026-12-02'};const c=command(r,a,'retry','2026-12');expect(()=>broken.command(c)).toThrow('injected');expect(r.read('2026-12')).toEqual(before);r.command(c);const m=r.read('2026-12').state.months['2026-12'];expect(balance(m,M)).toBe(90000);expect(balance(m,R)).toBe(10000);
  });
  it('resposta perdida depois do commit e reinício reconhece mesma tentativa mesmo com revisão antiga',()=>{
    const r=fixture();const c=command(r,pay(),'lost');const broken=new Repository(r.path,s=>{if(s==='response')throw new Error('lost response');});expect(()=>broken.command(c)).toThrow('lost response');
    const replay=new Repository(r.path).command(c);expect(replay.replay).toBe(true);expect(month(replay.state).events).toHaveLength(1);expect(balance(month(replay.state),A)).toBe(91000);
    expect(()=>r.command({...c,action:pay(5000)})).toThrow('conteúdo diferente');act(r,{type:'void',id:'lost'});act(r,pay(),'new');expect(realized(month(r.read(P).state),'food')).toBe(4000);
  });
  it('duas despesas de 80 sobre 100: versão antiga rejeitada, nova tentativa falha por fundos',async()=>{
    const s=examples();month(s).initials[A]=10000;const r=fixture(s);const first=command(r,pay(8000),'one'),second=command(r,pay(8000),'two');
    const results=await Promise.allSettled([Promise.resolve().then(()=>r.command(first)),Promise.resolve().then(()=>new Repository(r.path).command(second))]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(()=>r.command({...second,revision:r.read().revision})).toThrow('disponíveis');expect(balance(month(r.read(P).state),A)).toBe(2000);expect(month(r.read(P).state).events).toHaveLength(1);
  });
  it('mesma chave concorrente tem só um efeito; mês/snapshot não duplicam nem substituem',async()=>{
    const r=fixture(),c=command(r,pay(),'same');const results=await Promise.all([Promise.resolve().then(()=>r.command(c)),Promise.resolve().then(()=>new Repository(r.path).command(c))]);expect(results[1].replay).toBe(true);
    const snap=command(r,{type:'snapshot',date:`${P}-03`},'snap');r.command(snap);expect(r.command(snap).replay).toBe(true);unchanged(r,{type:'snapshot',date:`${P}-04`});
    act(r,{type:'month',period:'2026-12'},'open1');act(r,{type:'month',period:'2026-12'},'open2');const s=r.read('2026-12').state;expect(Object.keys(s.months)).toHaveLength(2);expect(s.months['2026-12'].events).toEqual([]);expect(Object.values(s.months['2026-12'].initials).every(x=>x===null)).toBe(true);
    expect(()=>act(r,{type:'void',id:'same'},undefined,'2026-12')).toThrow('ativo');
  });
  it('base, recorrentes, ocorrências, linhas removidas e null sobrevivem',()=>{
    const r=fixture();let s=r.read(P).state;act(r,{type:'line',target:'base',line:{...s.base[0],plan:null}});act(r,{type:'recurring',definition:{...s.recurring[0],name:'Nome revisto',amount:null}});act(r,{type:'occurrence',id:'google:2026-11',mode:'add'});act(r,{type:'removeLine',id:'occ:google:2026-11'});s=new Repository(r.path).read(P).state;
    expect(s.base[0].plan).toBeNull();expect(s.recurring[0].amount).toBeNull();expect(month(s).occurrences[0].state).toBe('open');expect(month(s).removedLines?.at(-1)?.name).toBe('Google One');expect(month(s).events).toEqual([]);
  });
  it('preparar reserva exige conta principal e não cria inicial ou compromisso',()=>{
    const p=path();migrate(p);const r=new Repository(p),period=r.read().state.selected;act(r,{type:'reserve',reserve:{id:'chosen',name:'Finalidade escolhida',accountId:'moey-r'}},undefined,period);const s=r.read().state;expect(s.reserves).toHaveLength(1);expect(s.months[period].initials['r:chosen']).toBeNull();expect(s.months[period].lines).toEqual([]);
    expect(()=>act(r,{type:'reserve',reserve:{id:'chosen',name:'Outra',accountId:'act-r'}},undefined,period)).toThrow('não pode ser alterada');
  });
  it.each([pay(1.5),pay(Number.MAX_SAFE_INTEGER+1),pay(-1),pay(1,'food','a:invalid'),{...pay(),date:'2026-11-31'}] as Action[])('comando inválido não deixa efeitos: %j',a=>{unchanged(fixture(),a);});
  it('cêntimos no limite seguro sobrevivem SQLite↔JS sem arredondamento',()=>{
    const r=fixture();act(r,{type:'month',period:'2026-12'});act(r,{type:'initial',source:A,amount:Number.MAX_SAFE_INTEGER},undefined,'2026-12');expect(new Repository(r.path).read('2026-12').state.months['2026-12'].initials[A]).toBe(9007199254740991);
  });
  it.each(['income','services','save-em','transfer'] as const)('correct persistido conserva os dois vínculos e os efeitos de %s',kind=>{
    const r=fixture();
    const original:FinancialAction=kind==='transfer'?{type:'transfer',source:A,destination:B,amount:5000,date:`${P}-02`}:pay(5000,kind,kind==='save-em'?M:A);
    const replacement:FinancialAction={...original,amount:3000};
    act(r,original,'original');act(r,{type:'correct',id:'original',replacement},'replacement');const s=new Repository(r.path).read(P).state;
    expect(month(s).events[0].voided).toBe(true);expect(month(s).events[0].replacedBy).toBe('replacement');expect(month(s).events[1].corrects).toBe('original');
    if(kind==='income'){expect(balance(month(s),A)).toBe(98000);expect(realized(month(s),'income')).toBe(3000);}
    if(kind==='services'){expect(balance(month(s),A)).toBe(92000);expect(realized(month(s),'services')).toBe(3000);}
    if(kind==='save-em'){expect(balance(month(s),M)).toBe(97000);expect(balance(month(s),R)).toBe(33000);}
    if(kind==='transfer'){expect(balance(month(s),A)).toBe(92000);expect(balance(month(s),B)).toBe(28000);}
  });
});

describe('API, falhas e fronteira de confiança',()=>{
  it('origem externa, sem Origin, GET e estado/efeitos manipulados não escrevem',async()=>{
    const r=fixture(),before=r.read();const c=command(r,pay());expect((await handlePost(request(c,'https://external.example'),r)).status).toBe(403);
    const absent=request(c);absent.headers.delete('origin');expect((await handlePost(absent,r)).status).toBe(403);
    expect((await handlePost(request({...c,state:examples()}),r)).status).toBe(422);expect((await handlePost(request({...c,action:{...pay(),deltas:{[A]:999}}}),r)).status).toBe(422);
    expect((await handleGet(new Request('http://127.0.0.1:3999/api/state',{headers:{host:'127.0.0.1:3999'}}),r)).status).toBe(200);expect(r.read()).toEqual(before);
  });
  it('API devolve conflito, replay e erro de domínio coerentes',async()=>{
    const r=fixture(),c=command(r,pay());expect((await handlePost(request(c),r)).status).toBe(200);const replay=await handlePost(request(c),r);expect((await replay.json()).replay).toBe(true);
    expect((await handlePost(request({...c,requestId:'stale'}),r)).status).toBe(409);
    expect((await handlePost(request(command(r,pay(999999))),r)).status).toBe(422);
  });
  it('bloqueio, caminho indisponível e gravação recusada não dão sucesso nem fallback',async()=>{
    const r=fixture(),db=connect(r.path);db.exec('BEGIN IMMEDIATE');const locked=await handlePost(request(command(r,pay())),r);expect(locked.status).toBe(503);db.exec('ROLLBACK');db.close();expect(month(r.read(P).state).events).toEqual([]);
    const missing=join(mkdtempSync(join(tmpdir(),'omeumes-test-')),'db.sqlite');expect((await handleGet(new Request('http://127.0.0.1:3999/api/state',{headers:{host:'127.0.0.1:3999'}}),new Repository(missing))).status).toBe(503);expect(existsSync(missing)).toBe(false);
    const denied=new Repository(r.path,()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});});const response=await handlePost(request(command(r,pay())),denied);expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain(r.path);expect(month(r.read(P).state).events).toEqual([]);
  });
});
