import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { Account, Feedback, IdentityView } from '../contracts';
import { Button } from '@/shared/ui/Button';
export const forms = {
  login: 'Entrar',
  register: 'Criar conta',
  forgot: 'Recuperar palavra-passe',
  reset: 'Definir nova palavra-passe',
  verify: 'Confirmar email',
  confirmEmail: 'Confirmar novo email',
  recoverEmail: 'Recuperar sem acesso ao email',
  reauth: 'Confirmar identidade',
  recoverMfa: 'Substituir autenticador perdido',
  password: 'Alterar palavra-passe',
  email: 'Alterar email',
  codes: 'Gerar códigos de recuperação',
  enroll: 'Configurar autenticador',
  activate: 'Confirmar autenticador',
  disable: 'Desativar autenticador',
};
export type FormName = keyof typeof forms;
export type Submit = (action: string, data?: Record<string, unknown>) => Promise<Feedback & { ok: boolean }>;
interface Props {
  screen: FormName;
  account: Account | null;
  documents: IdentityView['documents'];
  token: string;
  recovering: boolean;
  submit: Submit;
  finish: (action: FormName, result: Feedback) => void;
  busy: boolean;
  draft: string;
  editEmail: (value: string) => void;
}
export function IdentityForm({
  screen,
  account,
  documents,
  token,
  recovering,
  submit,
  finish,
  busy,
  draft,
  editEmail,
}: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [askOtp, setAskOtp] = useState(false);
  const [invite, setInvite] = useState('');
  const inviteDetails = useRef<HTMLDetailsElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (errors.invite && inviteDetails.current) inviteDetails.current.open = true;
    form.current?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus();
  }, [errors]);
  const emailField = ['login', 'register', 'forgot', 'recoverMfa', 'recoverEmail'].includes(screen);
  const proof =
    ['login', 'reauth', 'verify', 'recoverMfa', 'password', 'email', 'codes', 'disable'].includes(screen) ||
    (screen === 'enroll' && account?.scope !== 'replace');
  const newPass =
    screen === 'register' ||
    screen === 'password' ||
    screen === 'reset' ||
    (screen === 'confirmEmail' && recovering);
  const totp =
    screen === 'activate' ||
    screen === 'disable' ||
    (proof && (askOtp || (!!account?.mfa && screen !== 'verify' && screen !== 'recoverMfa')));
  const field = (
    name: string,
    label: string,
    type: string,
    autocomplete: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="auth-field" key={name}>
      <label htmlFor={'field-' + name}>{label}</label>
      <input
        id={'field-' + name}
        name={name}
        type={type}
        autoComplete={autocomplete}
        required
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? name + '-error' : undefined}
        {...props}
      />
      {error(name)}
    </div>
  );
  const error = (name: string) =>
    errors[name] && (
      <small className="inline-error" id={name + '-error'}>
        {errors[name]}
      </small>
    );
  const checkbox = (name: string, label: string, value = 'yes') => (
    <div>
      <label className="auth-check">
        <input
          type="checkbox"
          name={name}
          value={value}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? name + '-error' : undefined}
        />
        {label}
      </label>
      {error(name)}
    </div>
  );
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const data: Record<string, unknown> = Object.fromEntries(new FormData(element));
    if (screen === 'register') {
      data.adult = data.adult === 'yes';
      data.terms = data.terms ?? '';
      if (!invite.trim()) delete data.invite;
    }
    if (screen === 'login') data.remember = data.remember === 'yes';
    if (['reset', 'verify', 'confirmEmail'].includes(screen)) data.token = token;
    if (data.otp === '') delete data.otp;
    delete data.username;
    const result = await submit(screen, data);
    if (result.ok) {
      element.reset();
      finish(screen, result);
      return;
    }
    if (!element.isConnected) return;
    const fields = result.fields ?? {};
    setErrors(fields);
    if (fields.otp) setAskOtp(true);
    for (const input of element.querySelectorAll<HTMLInputElement>(
      'input[type=password],input[name=otp],input[name=code]',
    )) {
      const keepPassword =
        input.name === 'password' &&
        (fields.otp || (screen === 'register' && fields.invite && !fields.password));
      if (!keepPassword) input.value = '';
    }
  }
  return (
    <form key={screen} ref={form} className="auth-form" onSubmit={send} noValidate>
      {screen === 'register' && (
        <div className="auth-pair">
          {field('firstName', 'Primeiro nome', 'text', 'given-name')}
          {field('lastName', 'Último nome', 'text', 'family-name')}
        </div>
      )}
      {emailField &&
        field('email', 'Email', 'email', 'username', { autoCapitalize: 'none', spellCheck: false })}
      {!emailField && account && (
        <input type="text" name="username" autoComplete="username" value={account.email} readOnly hidden />
      )}
      {['email', 'recoverEmail'].includes(screen) &&
        field('newEmail', 'Novo email', 'email', 'email', {
          autoCapitalize: 'none',
          spellCheck: false,
          ...(screen === 'email'
            ? { defaultValue: draft, onChange: (e) => editEmail(e.currentTarget.value) }
            : {}),
        })}
      {proof &&
        field(
          'password',
          screen === 'password' ? 'Palavra-passe atual' : 'Palavra-passe',
          'password',
          'current-password',
        )}
      {newPass &&
        field(
          screen === 'register' ? 'password' : 'newPassword',
          screen === 'register' ? 'Palavra-passe' : 'Nova palavra-passe',
          'password',
          'new-password',
          { minLength: 15 },
        )}
      {newPass && <small>Usa pelo menos 15 caracteres. Podes usar espaços.</small>}
      {screen === 'register' && (
        <>
          <div className="auth-field">
            <label htmlFor="country">País de residência</label>
            <select
              id="country"
              name="country"
              autoComplete="country"
              defaultValue=""
              aria-invalid={!!errors.country}
              aria-describedby={errors.country ? 'country-error' : undefined}
            >
              <option value="">Escolhe o país</option>
              <option value="PT">Portugal</option>
            </select>
            {error('country')}
          </div>
          {checkbox('adult', 'Declaro que tenho 18 anos ou mais.')}
          {documents.map((doc) => (
            <details key={doc.kind}>
              <summary>{doc.title} · desenvolvimento</summary>
              <p>{doc.content}</p>
              <small>
                {doc.version} · {doc.locale}
              </small>
            </details>
          ))}
          {checkbox(
            'terms',
            'Aceito os Termos de utilização de desenvolvimento.',
            documents.find((d) => d.kind === 'terms')?.version ?? '',
          )}
          <details ref={inviteDetails}>
            <summary>Tenho um código de convite</summary>
            {field('invite', 'Código de convite', 'text', 'off', {
              required: false,
              maxLength: 256,
              value: invite,
              spellCheck: false,
              autoCapitalize: 'none',
              onChange: (e) => setInvite(e.currentTarget.value),
            })}
            <p>Ao confirmares o email, aceitas acesso ao espaço e a todo o seu histórico.</p>
            {invite && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setInvite('');
                  setErrors(({ invite: _invite, ...other }) => other);
                  inviteDetails.current?.querySelector('summary')?.focus();
                  if (inviteDetails.current) inviteDetails.current.open = false;
                }}
              >
                Retirar código
              </button>
            )}
            <p>Podes aceitar um novo convite mais tarde nas definições da tua conta.</p>
          </details>
        </>
      )}
      {totp &&
        field('otp', 'Código do autenticador', 'text', 'one-time-code', {
          inputMode: 'numeric',
          maxLength: 6,
          pattern: '[0-9]{6}',
        })}
      {['recoverEmail', 'recoverMfa'].includes(screen) &&
        field('code', 'Código de recuperação', 'text', 'off', {
          autoCapitalize: 'characters',
          spellCheck: false,
        })}
      {screen === 'login' && checkbox('remember', 'Manter sessão')}
      {screen === 'codes' && (
        <p>Os novos códigos substituem os anteriores. Cada código só pode ser usado uma vez.</p>
      )}
      {screen === 'disable' && (
        <p>Depois de confirmares, o próximo início de sessão usará apenas a palavra-passe.</p>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        {forms[screen]}
      </Button>
    </form>
  );
}
