'use client';
import { useState, useEffect } from 'react';
import type { Account } from '../contracts';
import type { Submit } from './IdentityForm';

type Ticket = {
  id: string;
  received: number;
  due: number;
  state: string;
  mine: boolean;
  messages: { at: number; sender: string; text: string }[];
};
type Space = {
  id: string;
  name: string;
  delete_due: number | null;
  members: { id: string; name: string }[];
  proposal?: { status: string; expires: number };
};
const date = (n: number) => new Date(n).toLocaleDateString('pt-PT');
const states: Record<string, string> = {
  open: 'Em análise',
  clarify: 'Aguarda esclarecimento',
  answered: 'Respondido',
  pending: 'A aguardar aceitação',
  declined: 'Recusada',
  expired: 'Expirada',
  cancelled: 'Cancelada',
  accepted: 'Aceite',
};
async function api(path: string, account: string, body?: unknown) {
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Account': account },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return data;
}
export function RightsPanel({ account }: { account: Account }) {
  const [data, setData] = useState<{
    available: boolean;
    operator: boolean;
    cases: Ticket[];
    notices: { message: string; at: number }[];
  } | null>(null);
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await api('privacy', account.id));
  }
  useEffect(() => {
    void refresh().catch((e) => setStatus(e.message));
  }, [account.id]);
  async function send(form: HTMLFormElement, id?: string) {
    if (busy) return;
    const values = Object.fromEntries(new FormData(form));
    const action = String(values.action || (id ? 'reply' : 'submit'));
    const body: Record<string, unknown> = { id, action };
    if (action !== 'hold') body.text = values.text;
    if (action === 'redact') {
      body.spaceId = values.spaceId;
      body.reason = values.reason;
    }
    if (action === 'answer') {
      body.decision = values.decision;
      body.recipients = values.recipients;
    }
    if (action === 'hold') {
      body.reason = values.reason;
      body.days = Number(values.days);
    }
    setBusy(true);
    try {
      const r = await api('privacy', account.id, body);
      await refresh();
      form.reset();
      setStatus(r.message);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card privacy-panel">
      <h2>Privacidade e direitos</h2>
      <p>
        Pede acesso, retificação, limitação ou apagamento dos teus dados, mesmo depois de saíres de um espaço.
        Só tu e o responsável designado podem acompanhar o pedido.
      </p>
      {data?.available && !data.operator ? (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send(e.currentTarget);
          }}
        >
          <label>
            O teu pedido
            <textarea
              name="text"
              required
              maxLength={2000}
              rows={3}
              placeholder="Indica o que pretendes e onde se encontra o dado. Evita incluir informação de terceiros."
            />
          </label>
          <button className="button primary" disabled={busy}>
            Apresentar pedido privado
          </button>
        </form>
      ) : data && !data.available ? (
        <p>
          O canal aguarda a designação do responsável. O contacto externo será disponibilizado antes da
          abertura.
        </p>
      ) : null}
      {status && <p role="status">{status}</p>}
      <h3>Pedidos e respostas</h3>
      <button className="text-button" onClick={() => void refresh().catch((e) => setStatus(e.message))}>
        Atualizar pedidos
      </button>
      {!data ? (
        <p>A consultar pedidos…</p>
      ) : !data.cases.length ? (
        <p>Ainda não existem pedidos.</p>
      ) : (
        data.cases.map((c) => (
          <details key={c.id}>
            <summary>
              {states[c.state]} · {date(c.received)}
            </summary>
            <p>Prazo de resposta até {date(c.due)}.</p>
            {c.messages.map((m, i) => (
              <p key={i}>
                <strong>{m.sender}</strong>
                <br />
                {m.text}
              </p>
            ))}
            {c.mine && c.state !== 'answered' && (
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(e.currentTarget, c.id);
                }}
              >
                <label>
                  Esclarecimento
                  <textarea name="text" required maxLength={2000} />
                </label>
                <button className="button" disabled={busy}>
                  Acrescentar esclarecimento
                </button>
              </form>
            )}
            {data.operator && !c.mine && (
              <OperatorForm closed={c.state === 'answered'} busy={busy} send={(f) => void send(f, c.id)} />
            )}
          </details>
        ))
      )}
      {data?.notices.map((n, i) => (
        <p key={i}>
          {date(n.at)} · {n.message}
        </p>
      ))}
    </section>
  );
}
function OperatorForm({
  closed,
  busy,
  send,
}: {
  closed: boolean;
  busy: boolean;
  send: (f: HTMLFormElement) => void;
}) {
  const [action, act] = useState(closed ? 'hold' : 'clarify');
  const current = closed ? 'hold' : action;
  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        send(e.currentTarget);
      }}
    >
      <label>
        Tratamento
        <select name="action" value={current} onChange={(e) => act(e.target.value)}>
          {(closed
            ? [['hold', 'Conservar prova por prazo definido']]
            : [
                ['clarify', 'Pedir esclarecimento'],
                ['answer', 'Responder ao pedido'],
                ['extend', 'Prorrogar prazo'],
                ['redact', 'Retirar texto do histórico'],
              ]
          ).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {current !== 'hold' && (
        <label>
          {current === 'redact' ? 'Texto pessoal a retirar' : 'Resposta fundamentada'}
          <textarea name="text" required maxLength={current === 'redact' ? 256 : 2000} />
        </label>
      )}
      {current === 'answer' && (
        <>
          <label>
            Decisão
            <select name="decision">
              <option value="granted">Deferimento</option>
              <option value="partial">Deferimento parcial</option>
              <option value="refused">Recusa</option>
            </select>
          </label>
          <label>
            Comunicações aos destinatários ou motivo da exceção
            <textarea name="recipients" required />
          </label>
        </>
      )}
      {current === 'redact' && (
        <label>
          Identificador do espaço
          <input name="spaceId" required />
        </label>
      )}
      {current === 'hold' && (
        <label>
          Dias até à revisão
          <input name="days" type="number" min={1} max={90} required />
        </label>
      )}
      {['hold', 'redact'].includes(current) && (
        <label>
          Fundamento sem conteúdo pessoal
          <textarea name="reason" required />
        </label>
      )}
      <button className="button" disabled={busy}>
        Confirmar tratamento
      </button>
    </form>
  );
}
export function ClosurePanel({ account, submit }: { account: Account; submit: Submit }) {
  const restricted = account.scope === 'closure';
  const [spaces, setSpaces] = useState<Space[] | null>(null),
    [open, setOpen] = useState(restricted),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const refresh = async () => setSpaces((await api('closure', account.id)).spaces);
  useEffect(() => {
    if (open) void refresh().catch((e) => setStatus(e.message));
  }, [open, account.id]);
  async function perform(form: HTMLFormElement, space?: Space) {
    if (busy) return;
    const { action, ...values } = Object.fromEntries(new FormData(form));
    if (!values.otp) delete values.otp;
    if (action !== 'proposeTransfer') delete values.memberId;
    setBusy(true);
    try {
      const result = await submit(String(action), { ...values, ...(space ? { spaceId: space.id } : {}) });
      setStatus(result.message || 'Revê os campos indicados.');
      if (result.ok) {
        form.reset();
        await refresh();
      }
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card privacy-panel">
      <h2>{restricted ? 'Conta em encerramento' : 'Espaços e encerramento'}</h2>
      {!open ? (
        <button className="text-button" onClick={() => setOpen(true)}>
          Gerir eliminação e encerramento
        </button>
      ) : (
        <>
          <p>
            {restricted
              ? 'Só tens acesso à gestão do encerramento. A conta será eliminada depois de resolveres todos os espaços próprios.'
              : 'Podes eliminar um espaço ou encerrar a conta. Revê primeiro os espaços de que és proprietário.'}
          </p>
          {spaces === null ? (
            <p>A consultar os teus espaços…</p>
          ) : !spaces.length ? (
            <p>Sem espaços próprios por resolver.</p>
          ) : (
            spaces.map((s) => (
              <SpaceChoice
                key={s.id}
                space={s}
                account={account}
                busy={busy}
                run={(f) => void perform(f, s)}
              />
            ))
          )}
          {!restricted && spaces !== null && (
            <details>
              <summary>Encerrar a minha conta</summary>
              <p>
                As sessões terminam imediatamente. Para cada espaço próprio, escolhe transferir a propriedade
                para um membro que aceite ou pedir a eliminação. Sem espaços próprios, o encerramento é
                imediato.
              </p>
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(e.currentTarget);
                }}
              >
                <input type="hidden" name="action" value="closeAccount" />
                <Proof mfa={account.mfa} />
                <button className="button" disabled={busy}>
                  Confirmar encerramento da conta
                </button>
              </form>
            </details>
          )}
          {status && <p role="status">{status}</p>}
          <button className="text-button" onClick={() => void refresh().catch((e) => setStatus(e.message))}>
            Atualizar estado dos espaços
          </button>
        </>
      )}
    </section>
  );
}
function Proof({ mfa }: { mfa: boolean }) {
  return (
    <>
      <label>
        Confirmar palavra-passe
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {mfa && (
        <label>
          Código do autenticador
          <input name="otp" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" />
        </label>
      )}
    </>
  );
}
function SpaceChoice({
  space: s,
  account,
  busy,
  run,
}: {
  space: Space;
  account: Account;
  busy: boolean;
  run: (form: HTMLFormElement) => void;
}) {
  const [choice, setChoice] = useState('deleteSpace');
  const action = s.delete_due ? 'cancelDeletion' : choice;
  const pending = s.proposal?.status === 'pending' && s.proposal.expires > Date.now();
  return (
    <details>
      <summary>
        {s.name} · {s.delete_due ? 'Eliminação pendente' : 'Ativo'}
      </summary>
      {s.proposal && (
        <p>
          Transferência ·{' '}
          {states[s.proposal.status === 'pending' && !pending ? 'expired' : s.proposal.status]}
        </p>
      )}
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(e.currentTarget);
        }}
      >
        <label>
          Ação no espaço
          <select name="action" value={action} onChange={(e) => setChoice(e.target.value)}>
            {s.delete_due ? (
              <option value="cancelDeletion">Cancelar eliminação</option>
            ) : (
              <>
                <option value="deleteSpace">Pedir eliminação do espaço</option>
                {s.members.length > 0 && !pending && (
                  <option value="proposeTransfer">Propor transferência</option>
                )}
                {pending && <option value="cancelProposal">Cancelar proposta</option>}
              </>
            )}
          </select>
        </label>
        {action === 'proposeTransfer' ? (
          <label>
            Novo proprietário
            <select name="memberId">
              {s.members.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ) : action === 'deleteSpace' ? (
          <p>
            Durante sete dias todos os membros podem consultar. Os convites e propostas pendentes são
            revogados. Depois desse prazo o espaço e o histórico são eliminados.
          </p>
        ) : s.delete_due ? (
          <p>Só leitura até {new Date(s.delete_due).toLocaleString('pt-PT')}. Cancelar retoma a escrita.</p>
        ) : null}
        <Proof mfa={account.mfa} />
        <button className="button" disabled={busy}>
          {action === 'cancelDeletion' ? 'Confirmar cancelamento' : 'Confirmar ação no espaço'}
        </button>
      </form>
    </details>
  );
}
