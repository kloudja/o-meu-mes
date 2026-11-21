import { useState } from 'react';

export interface IssuedInvite {
  id: string;
  code: string;
  expires: number;
}

export function InviteText({ invite, onClose }: { invite: IssuedInvite; onClose: () => void }) {
  const [feedback, setFeedback] = useState('');
  const text = `Convite para O meu mês. Aceitar dá acesso ao espaço e a todo o histórico. Entra ou regista-te com o email a que se destina este convite.\n\nCódigo: ${invite.code}\n\nPrivacidade: ${location.origin}/privacidade`;
  const data = { title: 'Convite para O meu mês', text };
  const nativeShare =
    typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data));
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(label);
    } catch {
      setFeedback('Podes selecionar e copiar o texto manualmente.');
    }
  }
  async function share() {
    try {
      await navigator.share(data);
      setFeedback('Texto entregue à opção de partilha escolhida.');
    } catch (error) {
      setFeedback(
        (error as Error).name === 'AbortError'
          ? 'Partilha cancelada ou indisponível. Podes copiar a mensagem.'
          : 'A partilha não abriu. Podes copiar a mensagem.',
      );
    }
  }
  return (
    <div className="share-issued">
      <label>
        Mensagem do convite
        <textarea value={text} readOnly rows={7} spellCheck={false} />
      </label>
      <div className="auth-actions">
        <button type="button" className="button" onClick={() => void copy(invite.code, 'Código copiado.')}>
          Copiar código
        </button>
        <button type="button" className="button primary" onClick={() => void copy(text, 'Mensagem copiada.')}>
          Copiar mensagem
        </button>
        {nativeShare && (
          <button type="button" className="button" onClick={() => void share()}>
            Partilhar…
          </button>
        )}
        <button type="button" className="text-button" onClick={onClose}>
          Ocultar código
        </button>
      </div>
      <p>Copia a mensagem e cola-a no serviço que escolheres.</p>
      <div className="auth-actions">
        <a href="mailto:">Email</a>
        <a href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <a href="https://web.telegram.org/" target="_blank" rel="noreferrer">
          Telegram
        </a>
      </div>
      {feedback && <p role="status">{feedback}</p>}
    </div>
  );
}
