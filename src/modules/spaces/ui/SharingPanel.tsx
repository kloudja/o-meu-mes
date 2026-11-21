'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SpaceRole } from '../access';
import { InviteText, type IssuedInvite } from './InviteText';
import { sharingRequest } from './sharing-request';

const titles = { owner: 'Proprietário', editor: 'Editor', reader: 'Leitor' };
const fecha = (expires: number) =>
  new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Lisbon',
  }).format(expires);
interface Sharing {
  role: SpaceRole;
  name: string;
  shared: boolean;
  members: { id: string; name: string; role: SpaceRole }[];
  invites: { id: string; email: string; role: SpaceRole; expires: number }[];
  transfer: { id: string; proposer: string; recipient: string; expires: number } | null;
}

export function SharingPanel({
  account,
  space,
  onChanged,
}: {
  account: string;
  space: string;
  onChanged: () => void;
}) {
  const [view, setView] = useState<Sharing | null>(null);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const epoch = useRef(0);
  const flight = useRef(false);
  const issuedMessage = useRef<HTMLHeadingElement>(null);
  const label = useId();
  async function load() {
    const stamp = ++epoch.current;
    try {
      const data = await sharingRequest<Sharing>(account, space);
      if (epoch.current !== stamp) return;
      setView(data);
      setIssued((value) => (value && data.invites.some((invite) => invite.id === value.id) ? value : null));
    } catch (err) {
      if (epoch.current === stamp) {
        setView(null);
        setIssued(null);
        setError((err as Error).message);
      }
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden && !flight.current) void load();
    }, 5000);
    return () => {
      clearInterval(timer);
      epoch.current++;
    };
  }, [account, space]);
  useEffect(() => {
    if (issued) issuedMessage.current?.focus({ preventScroll: false });
  }, [issued]);
  async function change(input: Record<string, unknown>, message: string, form?: HTMLFormElement) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    setFields({});
    const stamp = ++epoch.current;
    try {
      const result = await sharingRequest<Partial<IssuedInvite>>(account, space, input);
      if (epoch.current !== stamp) return;
      if (result.code && result.id && result.expires) {
        setIssued({ id: result.id, code: result.code, expires: result.expires });
      }
      form?.reset();
      setNotice(message);
      setPendingRemoval(null);
      onChanged();
      if (input.action !== 'leave') await load();
    } catch (err) {
      if (epoch.current !== stamp) return;
      const failure = err as Error & { fields?: Record<string, string> };
      setError(failure.message);
      setFields(failure.fields ?? {});
      if (form) {
        const field = Object.keys(failure.fields ?? {})[0];
        const password = form.querySelector<HTMLInputElement>('input[type=password]');
        if (password) password.value = '';
        if (field) (form.elements.namedItem(field) as HTMLInputElement | null)?.focus();
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>, action: string, message: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data.otp === '') delete data.otp;
    void change(
      { action, ...data, ...(action === 'proposeTransfer' ? { spaceId: space } : {}) },
      message,
      form,
    );
  }
  const owner = view?.role === 'owner';
  const transfer = view?.transfer;
  return (
    <section className="panel space-sharing" aria-labelledby={label}>
      <h2 id={label}>Partilha</h2>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!view &&
        (error ? (
          <button
            className="button"
            onClick={() => {
              setError('');
              void load();
            }}
          >
            Tentar novamente
          </button>
        ) : (
          <p role="status">A consultar a partilha…</p>
        ))}
      {view && (
        <>
          <p>
            <strong>{view.name}</strong> · {view.shared ? 'Espaço partilhado' : 'Espaço privado'} ·{' '}
            {titles[view.role]}
          </p>
          <h3>Membros</h3>
          <ul className="share-list">
            {view.members.map((member) => (
              <li key={member.id}>
                <div>
                  <strong>{member.name}</strong>{' '}
                  <span>
                    · {titles[member.role]}
                    {member.id === account ? ' (tu)' : ''}
                  </span>
                </div>
                {owner && member.role !== 'owner' && (
                  <div className="share-row-actions">
                    <form
                      key={member.role}
                      className="share-inline"
                      onSubmit={(e) => submit(e, 'role', 'Papel atualizado.')}
                    >
                      <input type="hidden" name="memberId" value={member.id} />
                      <select name="role" aria-label={'Papel de ' + member.name} defaultValue={member.role}>
                        <option value="editor">Editor</option>
                        <option value="reader">Leitor</option>
                      </select>
                      <button type="submit" className="button small" disabled={busy}>
                        Guardar papel
                      </button>
                    </form>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => setPendingRemoval(member.id)}
                    >
                      Remover acesso
                    </button>
                  </div>
                )}
                {pendingRemoval === member.id && (
                  <div className="share-confirm">
                    <p>{member.name} deixa de ter acesso a este espaço e ao seu histórico.</p>
                    <div className="auth-actions">
                      <button
                        className="button danger"
                        disabled={busy}
                        onClick={() =>
                          void change({ action: 'remove', memberId: member.id }, 'Acesso removido.')
                        }
                      >
                        Confirmar remoção
                      </button>
                      <button className="text-button" onClick={() => setPendingRemoval(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {owner && (
            <>
              <h3>Convidar alguém</h3>
              <p>A aceitação dá acesso a todo o espaço e a todo o histórico, mesmo no papel de leitor.</p>
              <p>
                Gerar um código substitui qualquer convite ativo para o mesmo email.{' '}
                <a href="/privacidade" target="_blank" rel="noreferrer">
                  Privacidade dos convites
                </a>
              </p>
              <form
                className="auth-form share-form"
                onSubmit={(e) => submit(e, 'issue', 'Código criado. Podes partilhar a mensagem.')}
              >
                <label>
                  Email da pessoa convidada
                  <input
                    name="email"
                    type="email"
                    autoComplete="off"
                    maxLength={254}
                    required
                    aria-invalid={!!fields.email}
                    aria-describedby={fields.email ? label + '-email' : undefined}
                  />
                </label>
                {fields.email && (
                  <small className="inline-error" id={label + '-email'}>
                    {fields.email}
                  </small>
                )}
                <label>
                  Papel no convite
                  <select name="role" defaultValue="reader">
                    <option value="reader">Leitor · consulta e histórico</option>
                    <option value="editor">Editor · consulta e registo</option>
                  </select>
                </label>
                <button className="button primary" disabled={busy}>
                  Gerar código
                </button>
              </form>
              {issued && (
                <div>
                  <h4 ref={issuedMessage} tabIndex={-1}>
                    Código válido até {fecha(issued.expires)}
                  </h4>
                  <InviteText key={issued.id} invite={issued} onClose={() => setIssued(null)} />
                </div>
              )}
              <h3>Convites ativos</h3>
              {view.invites.length === 0 ? (
                <p>Sem convites ativos.</p>
              ) : (
                <ul className="share-list">
                  {view.invites.map((i) => (
                    <li key={i.id}>
                      <div>
                        <strong>{i.email}</strong>
                        <small>
                          {titles[i.role]} · válido até {fecha(i.expires)}
                        </small>
                      </div>
                      <div className="auth-actions">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void change(
                              { action: 'regenerate', id: i.id },
                              'Novo código criado. O anterior deixou de ser válido.',
                            )
                          }
                        >
                          Gerar novo código
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() => void change({ action: 'revoke', id: i.id }, 'Convite revogado.')}
                        >
                          Revogar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {(transfer || owner) && (
            <div className="share-transfer">
              <h3>Transferência de propriedade</h3>
              {transfer ? (
                <>
                  <p>
                    {owner
                      ? `A aguardar resposta de ${view.members.find((m) => m.id === transfer.recipient)?.name}.`
                      : `${view.members.find((m) => m.id === transfer.proposer)?.name} propôs que passes a gerir este espaço.`}{' '}
                    Válida até {fecha(transfer.expires)}.
                  </p>
                  <div className="auth-actions">
                    {owner ? (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void change({ action: 'cancelTransfer', id: transfer.id }, 'Proposta cancelada.')
                        }
                      >
                        Cancelar proposta
                      </button>
                    ) : (
                      <>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            void change(
                              { action: 'acceptTransfer', id: transfer.id },
                              'Propriedade transferida.',
                            )
                          }
                        >
                          Aceitar propriedade
                        </button>
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() =>
                            void change({ action: 'declineTransfer', id: transfer.id }, 'Proposta recusada.')
                          }
                        >
                          Recusar proposta
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : view.members.length === 1 ? (
                <p>Adiciona um membro para poderes propor a transferência.</p>
              ) : (
                <details>
                  <summary>Propor transferência</summary>
                  <p>Se a proposta for aceite, passas a editor e os teus convites ativos são revogados.</p>
                  <form
                    className="auth-form share-form"
                    onSubmit={(e) => submit(e, 'proposeTransfer', 'Proposta de transferência criada.')}
                  >
                    <label>
                      Novo proprietário
                      <select name="memberId" required defaultValue="">
                        <option value="">Escolhe um membro</option>
                        {view.members
                          .filter((m) => m.role !== 'owner')
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {titles[m.role]}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Palavra-passe{' '}
                      <input type="password" name="password" autoComplete="current-password" required />
                    </label>
                    <label>
                      Código do autenticador (se estiver ativo)
                      <input
                        name="otp"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        aria-invalid={!!fields.otp}
                        aria-describedby={fields.otp ? label + '-otp' : undefined}
                      />
                    </label>
                    {fields.otp && (
                      <small className="inline-error" id={label + '-otp'}>
                        {fields.otp}
                      </small>
                    )}
                    <button className="button primary" disabled={busy}>
                      Confirmar proposta
                    </button>
                  </form>
                </details>
              )}
            </div>
          )}
          {!owner && (
            <details className="share-transfer">
              <summary>Sair do espaço</summary>
              <p>Ao saíres, perdes o acesso ao espaço e ao seu histórico.</p>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => void change({ action: 'leave' }, 'Saíste do espaço.')}
              >
                Confirmar saída
              </button>
            </details>
          )}
        </>
      )}
    </section>
  );
}
