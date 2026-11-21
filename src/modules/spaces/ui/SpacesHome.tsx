'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FinanceApp } from '../../finance/ui/FinanceApp';
import type { FinanceMemory } from '../../finance/client/draft';
import { newRequestId } from '../../finance/client/requestId';
import type { SpaceRole } from '../access';
import { ExportSpace } from './ExportSpace';
import { SharingPanel } from './SharingPanel';
import './spaces.css';

interface Space {
  id: string;
  name: string;
  currency: 'EUR';
  role: SpaceRole;
  shared: number;
  delete_due?: number | null;
}
export function SpacesHome({
  owner,
  name,
  memory,
  profile,
}: {
  owner: string;
  name: string;
  memory: FinanceMemory;
  profile: () => void;
}) {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [selected, setSelected] = useState(memory.space ?? '');
  const [adding, setAdding] = useState(false),
    [label, setLabel] = useState(''),
    [configure, setConfigure] = useState(false);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [accessNotice, setAccessNotice] = useState('');
  const token = useRef(0),
    intent = useRef(''),
    submitted = useRef(false),
    listVersion = useRef(0),
    activeRole = useRef<SpaceRole | undefined>(undefined);
  useLayoutEffect(
    () => () => {
      token.current++;
    },
    [],
  );
  function clearDraft() {
    memory.draft = undefined;
    memory.funding = undefined;
  }
  function loseAccess() {
    memory.space = '';
    memory.period = undefined;
    memory.screen = undefined;
    clearDraft();
    activeRole.current = undefined;
    setSelected('');
    setAccessNotice('Deixaste de ter acesso ao espaço. Os dados e os formulários abertos foram retirados.');
  }
  async function list() {
    const stamp = token.current;
    const version = ++listVersion.current;
    try {
      const r = await fetch('/api/spaces', { headers: { 'X-Account': owner }, cache: 'no-store' });
      if (!r.ok) throw new Error('Não foi possível consultar os espaços.');
      const result: { spaces: Space[] } = await r.json();
      if (stamp !== token.current || version !== listVersion.current) return;
      if (memory.space === undefined) memory.space = result.spaces[0]?.id ?? '';
      const current = result.spaces.find((space) => space.id === memory.space);
      if (memory.space && !current) loseAccess();
      if (current) {
        if (current.role !== activeRole.current && activeRole.current) {
          clearDraft();
          if (current.role === 'reader')
            setAccessNotice('O teu papel mudou para leitor. Podes consultar o espaço e o histórico.');
          else if (current.role === 'owner') setAccessNotice('Passaste a ser proprietário deste espaço.');
          else if (activeRole.current === 'owner')
            setAccessNotice('A propriedade foi transferida. Continuas neste espaço como editor.');
          else setAccessNotice('O teu papel mudou para editor.');
        }
        activeRole.current = current.role;
      }
      setSpaces(result.spaces);
      setSelected(memory.space);
    } catch (e) {
      if (stamp === token.current && version === listVersion.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void list();
    const poll = () => {
      if (!document.hidden && !submitted.current) void list();
    };
    const access = (event: Event) => {
      const { space, code } = (event as CustomEvent<{ space: string; code: string }>).detail;
      if (space !== memory.space) return;
      if (code === 'SPACE_ACCESS') loseAccess();
      void list();
    };
    const timer = setInterval(poll, 5000);
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('omeumes.spaceAccess', access);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('omeumes.spaceAccess', access);
    };
  }, [owner]);
  function choose(id: string) {
    token.current++;
    setBusy(false);
    submitted.current = false;
    setAdding(id === 'new');
    setLabel('');
    setError('');
    setAccessNotice('');
    intent.current = '';
    if (id === 'new') return;
    if (memory.space !== id) {
      memory.period = undefined;
      memory.screen = undefined;
      clearDraft();
    }
    activeRole.current = spaces?.find((space) => space.id === id)?.role;
    memory.space = id;
    setSelected(id);
  }
  async function create() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError('');
    const stamp = token.current;
    intent.current ||= newRequestId();
    try {
      const r = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account': owner },
        body: JSON.stringify({ name: label, requestId: intent.current }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      if (stamp !== token.current) return;
      const next: Space = { shared: 0, ...data.space };
      setSpaces((old) => [...(old ?? []).filter((s) => s.id !== next.id), next]);
      choose(next.id);
      memory.screen = configure ? 'settings' : 'month';
    } catch (e) {
      if (stamp === token.current) setError((e as Error).message);
    } finally {
      if (stamp === token.current) {
        setBusy(false);
        submitted.current = false;
      }
    }
  }
  const initials = name
    .split(/\s+/)
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .map((n) => n[0])
    .join('');
  const current = spaces?.find((s) => s.id === selected);
  const sharing = current && (
    <>
      {!current.delete_due && (
        <SharingPanel account={owner} space={current.id} onChanged={() => void list()} />
      )}
      {current.role === 'owner' && <ExportSpace account={owner} space={current.id} />}
    </>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Saltar para o conteúdo
      </a>
      <header className="space-bar">
        <div className="space-brand">
          <img src="/icon.svg" width="30" height="30" alt="" />
          <span>O meu mês</span>
        </div>
        <div className="space-context">
          <label>
            Espaço
            <select
              title={spaces?.find((s) => s.id === selected)?.name}
              aria-label="Espaço"
              disabled={spaces === null}
              value={adding ? 'new' : selected}
              onChange={(e) => choose(e.target.value)}
            >
              {!selected && <option value="">{spaces?.length ? 'Escolher espaço…' : 'Sem espaços'}</option>}
              {spaces?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="new">Criar espaço…</option>
            </select>
          </label>
          <button
            className="space-avatar"
            aria-label="Definições do utilizador"
            title={name}
            onClick={profile}
          >
            {initials}
          </button>
        </div>
      </header>
      {current?.delete_due && (
        <p role="status" className="space-access-notice">
          Eliminação pendente. Espaço só de leitura até {new Date(current.delete_due).toLocaleString('pt-PT')}
          . O proprietário pode cancelar nas definições do utilizador.
        </p>
      )}
      {accessNotice && (
        <p className="space-access-notice" role="status">
          {accessNotice}
        </p>
      )}
      {spaces === null ? (
        <main id="main" tabIndex={-1} className="auth-main">
          <p role="status">{error || 'A consultar os espaços…'}</p>
          {error && (
            <button className="button" onClick={() => void list()}>
              Tentar novamente
            </button>
          )}
        </main>
      ) : !spaces.length || adding ? (
        <main id="main" tabIndex={-1} className="auth-main">
          <section className="auth-card">
            <h1>{spaces.length ? 'Criar espaço' : 'Sem espaços'}</h1>
            <p>Cria um espaço privado para organizar as tuas contas e os teus meses em euros.</p>
            {!spaces.length && (
              <button className="text-button" onClick={profile}>
                Aceitar convite nas definições da conta
              </button>
            )}
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label>
                Nome do espaço
                <input
                  required
                  maxLength={80}
                  value={label}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'space-error' : undefined}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    intent.current = '';
                    setError('');
                  }}
                  disabled={busy}
                />
              </label>
              <fieldset>
                <legend>Como queres começar?</legend>
                <label className="space-choice">
                  <input type="radio" checked={!configure} onChange={() => setConfigure(false)} />
                  Começar rapidamente
                </label>
                <label className="space-choice">
                  <input type="radio" checked={configure} onChange={() => setConfigure(true)} />
                  Configurar agora
                </label>
                {configure && (
                  <small>
                    Depois de escolheres o primeiro mês, podes definir as contas e categorias do espaço.
                  </small>
                )}
              </fieldset>
              {error && (
                <p id="space-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={busy}>
                Criar espaço
              </button>
            </form>
            {adding && spaces.length > 0 && (
              <button className="text-button" onClick={() => choose(selected)}>
                Voltar ao espaço
              </button>
            )}
          </section>
        </main>
      ) : current ? (
        <FinanceApp
          key={current.id + ':' + current.role + ':' + !!current.delete_due}
          owner={owner}
          space={current.id}
          memory={memory}
          readOnly={current.role === 'reader' || !!current.delete_due}
          shared={!!current.shared}
          sharing={sharing}
        />
      ) : (
        <main id="main" tabIndex={-1} className="auth-main">
          <section className="auth-card">
            <h1>Escolher espaço</h1>
            <p>Escolhe no seletor o espaço que queres abrir.</p>
          </section>
        </main>
      )}
    </>
  );
}
