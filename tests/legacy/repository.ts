import { aid } from '../../src/modules/finance/domain/model';
import { canonical } from '../../src/modules/finance/domain/actions';
import { transact } from '../../src/modules/finance/domain/engine';
import { DomainError, validPeriod } from '../../src/modules/finance/domain/validation';
import { connect, databasePath } from '../../src/server/storage.mjs';
import type { Command, Confirmed } from '../../src/modules/finance/contracts/command';
import { load, persist, type Fault } from './state-tables';
export { load, persist, type Fault } from './state-tables';
export type { Command, Confirmed } from '../../src/modules/finance/contracts/command';

export class Repository {
  constructor(readonly path=databasePath(),readonly fault?:Fault){}
  read(period?:string):Confirmed{
    const db=connect(this.path);
    try{db.exec('BEGIN');const result=load(db,period);db.exec('COMMIT');return result;}finally{db.close();}
  }
  command(c:Command):Confirmed{
    validPeriod(c.period);
    const db=connect(this.path);let committed=false;
    try{
      db.exec('BEGIN IMMEDIATE');
      const current=load(db,c.period);
      if(!current.state.months[c.period])throw new DomainError('MONTH','Abra primeiro o mês pretendido.');
      current.state.selected=c.period;
      const scope=c.action.type==='month'?'open':c.period;
      const key=JSON.stringify([scope,c.requestId]);
      let replay=false;
      if(Object.hasOwn(current.state.requests,key)){
        if(current.state.requests[key]!==canonical(c.action))throw new DomainError('IDEMPOTENCY','Esta confirmação já foi usada com conteúdo diferente.');
        replay=true;
      }else{
        if(c.revision!==current.revision)throw new DomainError('CONFLICT','Os dados foram atualizados noutro pedido ou separador. Reveja os valores e confirme novamente.');
        const next=transact(current.state,c.action,c.requestId);
        if(c.action.type==='deleteAccount'){
          const source=aid(c.action.id);
          db.prepare('DELETE FROM initials WHERE source=? AND amount IS NULL').run(source);
          db.prepare('DELETE FROM origins WHERE id=?').run(source);
          db.prepare('DELETE FROM accounts WHERE id=?').run(c.action.id);
        }
        persist(db,next,this.fault);
        db.prepare('UPDATE meta SET revision=revision+1 WHERE id=1').run();
      }
      const target=c.action.type==='month'?c.action.period:c.period;
      const result={...load(db,target),replay};
      this.fault?.('commit');db.exec('COMMIT');committed=true;
      this.fault?.('response');return result;
    }catch(e){if(!committed&&db.isTransaction)db.exec('ROLLBACK');throw e;}finally{db.close();}
  }
}
