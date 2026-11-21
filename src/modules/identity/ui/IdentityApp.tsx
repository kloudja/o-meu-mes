'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClosurePanel, RightsPanel } from './PrivacyPanel';
import { forms, IdentityForm, type FormName, type Submit } from './IdentityForm';
import type { IdentityView, Feedback } from '../contracts';
import './identity.css';

const deliveryText: Record<string, string> = {
  pending: 'A confirmação está na fila para envio.',
  sending: 'A confirmação está a ser enviada.',
  accepted: 'O fornecedor aceitou a mensagem. Abre o email para confirmar.',
  delivered: 'A mensagem foi entregue. Abre a ligação para confirmar.',
  deferred:
    'A tua conta foi criada. A confirmação por email está temporariamente pendente. Não precisas de voltar a registar-te.',
  failed: 'O serviço não conseguiu enviar a mensagem. Podes pedir uma nova ligação.',
};
interface IdentityProps {
  workspace: (id: string, name: string, profile: () => void) => React.ReactNode;
  clearWorkspace: () => void;
  invitations: (id: string) => React.ReactNode;
}
export function IdentityApp({ workspace, clearWorkspace, invitations }: IdentityProps) {
  const [profile, setProfile] = useState(false);
  const previousOwner = useRef<string | null>(null);
  const [view, setView] = useState<IdentityView | null>(null);
  const [screen, setScreen] = useState<FormName | 'home'>('home');
  const [link, setLink] = useState({ token: '', recovering: false });
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [secret, setSecret] = useState('');
  const generation = useRef(0);
  const identity = useRef<string | null>(null);
  const emailDraft = useRef<{ owner: string; value: string } | null>(null);
  const authEvent = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const inFlight = useRef(false);
  const forget = useCallback(() => {
    setProfile(false);
    setCodes([]);
    setSecret('');
    setScreen('home');
    setLink({ token: '', recovering: false });
  }, []);
  const refresh = useCallback(async () => {
    const stamp = ++generation.current;
    try {
      const response = await fetch('/api/identity', { cache: 'no-store' });
      const data = await response.json();
      if (stamp !== generation.current) return;
      if (!response.ok) throw new Error(data.message);
      const next = data as IdentityView;
      const id = next.account?.id ?? null;
      if (id && id !== previousOwner.current) {
        clearWorkspace();
        previousOwner.current = id;
      }
      if (identity.current !== id && identity.current !== null) {
        forget();
        setMessage(id ? 'A conta ativa mudou.' : 'A sessão terminou. Volta a entrar.');
      }
      if (next.account?.scope === 'closure') clearWorkspace();
      if (id && (emailDraft.current?.owner !== id || next.account?.scope !== 'account'))
        emailDraft.current = null;
      identity.current = id;
      setView(next);
    } catch {
      if (stamp !== generation.current) return;
      forget();
      setView(null);
      setFailure(true);
      setMessage('Não foi possível consultar a conta. Verifica a ligação e tenta novamente.');
    }
  }, [forget, clearWorkspace]);
  useEffect(() => {
    function openLink() {
      const params = new URLSearchParams(location.hash.slice(1));
      for (const [key, mode] of [
        ['verify', 'verify'],
        ['email', 'confirmEmail'],
        ['reset', 'reset'],
      ] as const) {
        const token = params.get(key);
        if (token) {
          forget();
          setMessage('');
          setLink({ token, recovering: params.get('recovery') === '1' });
          setScreen(mode);
          history.replaceState(null, '', location.pathname);
          break;
        }
      }
    }
    openLink();
    window.addEventListener('hashchange', openLink);
    void refresh();
    const sync = new BroadcastChannel('omeumes.identity');
    channel.current = sync;
    const changed = () => {
      ++authEvent.current;
      ++generation.current;
      emailDraft.current = null;
      forget();
      setView(null);
      setMessage('');
      void refresh();
    };
    sync.onmessage = () => {
      clearWorkspace();
      changed();
    };
    const access = () => {
      setView(null);
      void refresh();
    };
    window.addEventListener('omeumes.access', access);
    const focus = () => {
      void refresh();
    };
    const resume = (e: PageTransitionEvent) => {
      if (e.persisted) changed();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('omeumes.access', access);
      sync.close();
      window.removeEventListener('hashchange', openLink);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', resume);
    };
  }, [refresh, forget]);
  const account = view?.account;
  useEffect(() => {
    if (!account || !view) return;
    const timer = setInterval(() => {
      if (!document.hidden && !inFlight.current) void refresh();
    }, view.refresh);
    const expiry = setTimeout(
      () => {
        forget();
        setView(null);
        void refresh();
      },
      Math.max(0, account.expiresAt - Date.now()),
    );
    return () => {
      clearInterval(timer);
      clearTimeout(expiry);
    };
  }, [account, view, refresh, forget]);
  const lastActivity = useRef(0);
  function activity() {
    if (!account || !view || inFlight.current || Date.now() - lastActivity.current < view.refresh) return;
    lastActivity.current = Date.now();
    void fetch('/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Account': account.id },
      body: JSON.stringify({ action: 'activity' }),
    })
      .then(() => refresh())
      .catch(() => {});
  }
  const submit: Submit = async (action, data = {}) => {
    if (inFlight.current) return { ok: false };
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setFailure(false);
    const actor = identity.current;
    const event = authEvent.current;
    try {
      const response = await fetch('/api/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(actor ? { 'X-Account': actor } : {}) },
        body: JSON.stringify({ action, ...data }),
      });
      const result = (await response.json()) as Feedback;
      if (actor !== identity.current) return { ok: false };
      await refresh();
      if (event !== authEvent.current || ((result.secret || result.codes) && actor !== identity.current))
        return { ok: false };
      if (response.ok) {
        if (!['activity', 'resend', 'forgot', 'register', 'enroll'].includes(action))
          channel.current?.postMessage('alterada');
        if (['logout', 'revokeAll', 'revoke', 'closeAccount'].includes(action)) {
          clearWorkspace();
          emailDraft.current = null;
          forget();
        }
      }
      if (response.status === 428) setScreen('reauth');
      setFailure(!response.ok);
      setMessage(result.message ?? '');
      return { ...result, ok: response.ok };
    } catch {
      setFailure(true);
      setMessage('Não foi possível confirmar o pedido. Consulta a conta antes de repetir.');
      return { ok: false };
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  function go(mode: FormName | 'home') {
    emailDraft.current = null;
    setScreen(mode);
    setSecret('');
    setCodes([]);
    setMessage('');
    setFailure(false);
  }
  function finish(action: FormName, result: Feedback) {
    setLink({ token: '', recovering: false });
    setCodes(result.codes ?? []);
    setSecret(result.secret ?? '');
    const resume = action === 'login' && !!identity.current && emailDraft.current?.owner === identity.current;
    if (!resume) emailDraft.current = null;
    if (action === 'login') setProfile(!!resume);
    if (result.codes || action === 'activate') setProfile(true);
    setScreen(action === 'enroll' ? 'activate' : resume ? 'email' : 'home');
  }
  const button = (text: string, action: () => void, style = 'button') => (
    <button className={style} disabled={busy} onClick={action}>
      {text}
    </button>
  );
  const current = screen === 'home' && !account ? 'login' : screen;
  if (current === 'home' && account?.scope === 'account' && !profile)
    return (
      <div className="auth-shell" onKeyDown={activity} onPointerDown={activity}>
        {workspace(account.id, account.name, () => {
          setProfile(true);
          setMessage('');
        })}
      </div>
    );
  const publicForm = ['verify', 'reset', 'confirmEmail'].includes(current);
  return (
    <div className="auth-shell" onKeyDown={activity} onPointerDown={activity}>
      <header className="auth-header">
        <div className="auth-brand">
          <img src="/icon.svg" width="38" height="38" alt="" />O meu mês
        </div>
        {account?.scope === 'account' &&
          button(
            'Voltar aos espaços',
            () => {
              setProfile(false);
              go('home');
            },
            'text-button',
          )}
        {account && button('Terminar sessão', () => void submit('logout'), 'text-button')}
      </header>
      <main className={'auth-main' + (current === 'home' ? ' account-main' : '')}>
        {message && (
          <p className={failure ? 'form-error' : 'auth-feedback'} role={failure ? 'alert' : 'status'}>
            {message}
          </p>
        )}
        {!view ? (
          <section className="auth-card">
            <h1>{failure ? 'Acesso à conta' : 'A abrir a conta…'}</h1>
            {failure && button('Tentar novamente', () => void refresh())}
          </section>
        ) : current !== 'home' ? (
          <section className="auth-card">
            <h1>{forms[current]}</h1>
            {current === 'register' && <p>Registo local com documentos de desenvolvimento.</p>}
            {current === 'login' && <p>Acede à tua conta de O meu mês.</p>}
            {current === 'recoverEmail' && (
              <p>
                Para contas sem autenticador. Precisas de um código de recuperação guardado e de um novo
                endereço de email.
              </p>
            )}
            {current === 'recoverMfa' && (
              <p>Usa a palavra-passe e um código de recuperação para configurar um novo autenticador.</p>
            )}
            {current === 'activate' && secret && (
              <div className="auth-key">
                <strong>Chave de configuração</strong>
                <code>{secret}</code>
                <small>TOTP · 6 algarismos · 30 segundos</small>
              </div>
            )}
            <IdentityForm
              key={(account?.id ?? 'anonymous') + current}
              screen={current}
              account={account ?? null}
              documents={view.documents}
              token={link.token}
              recovering={link.recovering}
              submit={submit}
              finish={finish}
              busy={busy}
              draft={account && account.id === emailDraft.current?.owner ? emailDraft.current.value : ''}
              editEmail={(value) => {
                if (account?.scope === 'account') emailDraft.current = { owner: account.id, value };
              }}
            />
            {current === 'login' ? (
              <div className="auth-links">
                {button('Criar conta', () => go('register'), 'text-button')}
                {button('Esqueci-me da palavra-passe', () => go('forgot'), 'text-button')}
                <a href="/privacidade">Privacidade e contacto</a>
              </div>
            ) : (
              button(account && !publicForm ? 'Voltar à conta' : 'Voltar', () => go('home'), 'text-button')
            )}
            {current === 'forgot' && (
              <div className="auth-links">
                {button(forms.recoverEmail, () => go('recoverEmail'), 'text-button')}
                {button(forms.recoverMfa, () => go('recoverMfa'), 'text-button')}
              </div>
            )}
          </section>
        ) : (
          account && (
            <>
              <section className="auth-card">
                <h1>{account.name}</h1>
                <p>{account.email}</p>
                {account.scope === 'pending' ? (
                  <>
                    <h2>Email por confirmar</h2>
                    <p>
                      {deliveryText[account.delivery ?? ''] ??
                        'A ligação expirou. Pede uma nova confirmação.'}
                    </p>
                    {button('Reenviar confirmação', () => void submit('resend'))}
                  </>
                ) : account.scope === 'closure' ? (
                  <p>Acesso restrito à gestão dos teus espaços próprios.</p>
                ) : account.scope === 'replace' ? (
                  <>
                    <h2>Substituir autenticador</h2>
                    <p>Esta sessão permite configurar o novo autenticador.</p>
                    {button('Configurar autenticador', () => go('enroll'))}
                  </>
                ) : (
                  <>
                    <h2>Perfil e preferências</h2>
                    <dl className="account-preferences">
                      <dt>Residência</dt>
                      <dd>{account.country === 'PT' ? 'Portugal' : account.country}</dd>
                      <dt>Idioma da interface</dt>
                      <dd>{account.interfaceLocale}</dd>
                      <dt>Idioma das comunicações</dt>
                      <dd>{account.communicationLocale}</dd>
                    </dl>
                    <details>
                      <summary>Privacidade</summary>
                      <p>{view.documents.find((d) => d.kind === 'privacy')?.content}</p>
                    </details>
                  </>
                )}
              </section>
              {account.scope === 'account' && <RightsPanel key={account.id} account={account} />}
              {(account.scope === 'account' || account.scope === 'closure') && (
                <>
                  <ClosurePanel key={account.id + account.scope} account={account} submit={submit} />
                  {account.scope === 'closure' && (
                    <details className="auth-card">
                      <summary>Exercer os meus direitos durante o encerramento</summary>
                      <RightsPanel key={account.id} account={account} />
                    </details>
                  )}
                </>
              )}
              {account.scope === 'account' && (
                <>
                  {invitations(account.id)}
                  {codes.length > 0 && (
                    <section className="auth-card auth-codes">
                      <h2>Códigos de recuperação</h2>
                      <p>Guarda estes códigos num local seguro. São apresentados uma única vez.</p>
                      <ul>
                        {codes.map((code) => (
                          <li key={code}>
                            <code>{code}</code>
                          </li>
                        ))}
                      </ul>
                      <div className="auth-actions">
                        {button(
                          'Copiar códigos',
                          () =>
                            void navigator.clipboard
                              .writeText(codes.join('\n'))
                              .then(() => setMessage('Códigos copiados.'))
                              .catch(() => setMessage('Seleciona os códigos para os copiar.')),
                        )}
                        {button('Imprimir códigos', () => window.print())}
                        {button('Já guardei os códigos', () => setCodes([]))}
                      </div>
                    </section>
                  )}
                  <section className="auth-card">
                    <h2>Segurança da conta</h2>
                    <p>
                      {account.mfa ? 'Autenticador ativo.' : 'Autenticador desativado.'}{' '}
                      {account.hasCodes
                        ? 'Existem códigos de recuperação válidos.'
                        : 'Guarda códigos de recuperação para poderes recuperar o acesso.'}
                    </p>
                    {account.pendingEmail && (
                      <p>
                        Alteração pendente para {account.pendingEmail}.{' '}
                        {account.delivery === 'deferred'
                          ? 'Envio temporariamente adiado.'
                          : (deliveryText[account.delivery ?? ''] ?? 'Pede outra ligação em Alterar email.')}
                      </p>
                    )}
                    <div className="auth-actions">
                      {(['password', 'email', account.mfa ? 'disable' : 'enroll', 'codes'] as const).map(
                        (mode) => (
                          <button className="button" key={mode} onClick={() => go(mode)} disabled={busy}>
                            {forms[mode]}
                          </button>
                        ),
                      )}
                    </div>
                  </section>
                  <section className="auth-card">
                    <h2>Sessões ativas</h2>
                    <ul className="auth-sessions">
                      {view.sessions.map((s) => (
                        <li key={s.id}>
                          <div>
                            <strong>{s.current ? 'Esta sessão' : 'Outra sessão'}</strong>
                            <small>
                              {s.remembered ? 'Sessão mantida' : 'Sessão normal'} ·{' '}
                              {new Date(s.created).toLocaleString('pt-PT')}
                            </small>
                          </div>
                          {button(
                            'Revogar sessão',
                            () => void submit('revoke', { sessionId: s.id }),
                            'text-button',
                          )}
                        </li>
                      ))}
                    </ul>
                    {button('Terminar todas as sessões', () => void submit('revokeAll'))}
                  </section>
                </>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
