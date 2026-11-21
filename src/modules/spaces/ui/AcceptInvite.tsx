'use client';

import { useId, useRef, useState } from 'react';
import { sharingRequest } from './sharing-request';

export function AcceptInvite({ owner }: { owner: string }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const id = useId();
  return (
    <section className="auth-card">
      <h2>Aceitar convite</h2>
      <p>Usa o código recebido para aceder ao espaço e a todo o seu histórico, com o papel atribuído.</p>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (flight.current) return;
          const form = e.currentTarget;
          flight.current = true;
          setBusy(true);
          setError('');
          setMessage('');
          try {
            await sharingRequest(owner, null, {
              action: 'acceptInvite',
              code: new FormData(form).get('code'),
            });
            form.reset();
            setMessage('Convite aceite. Podes escolher o espaço no seletor de espaços.');
          } catch (err) {
            setError((err as Error).message);
            form.querySelector('input')?.focus();
          } finally {
            flight.current = false;
            setBusy(false);
          }
        }}
      >
        <label htmlFor={id}>Código de convite</label>
        <input
          id={id}
          name="code"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          required
          maxLength={256}
          aria-invalid={!!error}
          aria-describedby={error ? id + '-error' : undefined}
        />
        {error && (
          <small id={id + '-error'} className="inline-error" role="alert">
            {error}
          </small>
        )}
        {message && <p role="status">{message}</p>}
        <button type="submit" className="button primary" disabled={busy}>
          Aceitar convite
        </button>
      </form>
    </section>
  );
}
