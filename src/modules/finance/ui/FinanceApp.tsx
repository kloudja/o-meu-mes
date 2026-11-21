'use client';
import { useState } from 'react';
import { usePersistentStore } from '../client/usePersistentStore';
import type { FinanceMemory } from '../client/draft';
import { calendarDate } from '../domain/money';
import { FinanceWorkspace } from './FinanceWorkspace';
import { newRequestId } from '../client/requestId';

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
  const [message, setMessage] = useState('');
  const [intent, setIntent] = useState(newRequestId);
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
                setMessage('');
                try {
                  await store.dispatch({ type: 'month', period }, intent);
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            >
              <label>
                Mês
                <input
                  type="month"
                  required
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setIntent(newRequestId());
                  }}
                />
              </label>
              {(message || store.error) && <p role="alert">{message || store.error}</p>}
              <button className="button primary" disabled={store.busy || store.uncertain}>
                Criar primeiro mês
              </button>
            </form>
          )}
          {store.uncertain && (
            <button
              className="button"
              onClick={async () => {
                try {
                  const saved = await store.retry();
                  setMessage(saved ? 'Mês confirmado.' : 'Tentativa encerrada sem efeito.');
                  setIntent(newRequestId());
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Verificar confirmação
            </button>
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
