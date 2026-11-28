'use client';
import { useState } from 'react';
import { usePersistentStore } from '../client/usePersistentStore';
import type { FinanceMemory } from '../client/draft';
import { calendarDate, monthLabel } from '../domain/money';
import { FinanceWorkspace } from './FinanceWorkspace';
import { newRequestId } from '../client/requestId';
import { MonthField } from './MonthField';

export function FinanceApp({
  owner,
  space,
  memory,
  readOnly,
  shared,
  sharing,
}: {
  owner: string;
  space: string;
  memory: FinanceMemory;
  readOnly: boolean;
  shared: boolean;
  sharing: React.ReactNode;
}) {
  const store = usePersistentStore(owner, space, memory.period, readOnly);
  const [period, setPeriod] = useState(() => calendarDate().slice(0, 7));
  const [message, setMessage] = useState<{ text: string; role: 'alert' | 'status' }>();
  const [intent, setIntent] = useState(newRequestId);
  const { pendingPeriod } = store;
  const blocked = store.busy || store.uncertain;
  if (!store.state)
    return (
      <section id="main" tabIndex={-1} className="auth-main">
        <p role="status">{store.error || 'A abrir o espaço…'}</p>
        {store.error && (
          <button className="button" onClick={() => void store.refresh()}>
            Tentar novamente
          </button>
        )}
      </section>
    );
  if (!store.state.selected)
    return (
      <main id="main" tabIndex={-1} className="auth-main">
        <section className="auth-card">
          <h1>Ainda sem meses</h1>
          <p>
            {readOnly
              ? 'Poderás consultar os meses quando forem criados.'
              : 'Escolhe o mês em que queres começar.'}
          </p>
          {!readOnly && (
            <form
              className="auth-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (blocked) return;
                setMessage(undefined);
                try {
                  await store.dispatch({ type: 'month', period }, intent);
                } catch (error) {
                  setMessage({ text: (error as Error).message, role: 'alert' });
                  setIntent(newRequestId());
                }
              }}
            >
              <MonthField
                value={pendingPeriod ?? period}
                disabled={blocked}
                onChange={(selected) => {
                  setPeriod(selected);
                  setMessage(undefined);
                  setIntent(newRequestId());
                }}
              />
              {message && (
                <p role={message.role} className={message.role === 'alert' ? 'form-error' : undefined}>
                  {message.text}
                </p>
              )}
              {store.error && (
                <p role="alert" className="form-error">
                  {store.error}
                </p>
              )}
              <button type="submit" className="button primary" disabled={blocked}>
                Criar primeiro mês
              </button>
              {pendingPeriod && (
                <>
                  <p role="status">Confirmação por verificar · {monthLabel(pendingPeriod)}.</p>
                  <button
                    type="button"
                    className="button"
                    disabled={store.busy}
                    onClick={async () => {
                      setMessage(undefined);
                      setPeriod(pendingPeriod);
                      try {
                        const saved = await store.retry();
                        setMessage({
                          text: saved ? 'Mês confirmado.' : 'Tentativa encerrada sem efeito.',
                          role: 'status',
                        });
                        setIntent(newRequestId());
                      } catch (error) {
                        setMessage({ text: (error as Error).message, role: 'alert' });
                      }
                    }}
                  >
                    Verificar confirmação
                  </button>
                </>
              )}
            </form>
          )}
        </section>
        {sharing}
      </main>
    );
  return (
    <FinanceWorkspace
      key={store.state.selected}
      store={{ ...store, state: store.state }}
      memory={memory}
      space={space}
      readOnly={readOnly}
      shared={shared}
      sharing={sharing}
    />
  );
}
