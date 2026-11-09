'use client';

import { useRef, useState } from 'react';

type Operation = 'backup' | 'export';
const dateFormat = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon',
});

export function LocalFiles({ home = false }: { home?: boolean }) {
  const running = useRef<Operation | null>(null);
  const [busy, setBusy] = useState<Operation | null>(null);
  const [backup, setBackup] = useState<{ path: string; createdAt: string }>();
  const [copyMessage, setCopyMessage] = useState('');
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<{ action: Operation; message: string }>();

  async function run(action: Operation) {
    if (running.current) return;
    running.current = action;
    setBusy(action);
    setError(undefined);
    if (action === 'export') setExported(false);
    else setCopyMessage('');
    try {
      const response = await fetch(`/api/local-files?action=${action}`, { method: 'POST' });
      if (!response.ok) throw new Error((await response.json()).message);
      if (action === 'backup') {
        const result = await response.json();
        if (typeof result.path !== 'string' || !Number.isFinite(Date.parse(result.createdAt))) {
          throw new Error('A resposta do backup não pôde ser confirmada. Pode voltar a criar uma cópia.');
        }
        setBackup(result);
      } else {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = 'o-meu-mes-exportacao.json';
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setExported(true);
      }
    } catch (failure) {
      setError({ action, message: failure instanceof Error && failure.message.startsWith('Não foi possível')
        ? failure.message : 'Não foi possível confirmar o resultado. Verifique a ligação à aplicação local e tente novamente.' });
    } finally {
      running.current = null;
      setBusy(null);
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopyMessage('Caminho copiado.');
    } catch {
      setCopyMessage('Selecione o caminho acima e copie-o com Ctrl+C.');
    }
  }

  return <section className="panel local-files" aria-labelledby="local-files-title">
    <h2 id="local-files-title">Dados locais</h2>
    <p>Os registos ficam em SQLite {home ? 'no PC de casa.' : 'neste computador.'}</p>
    <div className="local-file-actions">
      <div className="local-file-action">
        <h3>Cópia de segurança</h3>
        <p>Guarda todos os meses e registos num ficheiro SQLite verificado, na pasta <strong>backups</strong> junto à base.</p>
        <button className="button primary" aria-disabled={!!busy} onClick={() => void run('backup')}>Criar backup</button>
        <div className="local-file-feedback" role="status">
          {busy === 'backup' && <p>A criar e verificar o backup…</p>}
          {backup && busy !== 'backup' && <>
            <p><strong>{error?.action === 'backup' ? 'Último backup confirmado' : 'Backup verificado'}</strong> · <time dateTime={backup.createdAt}>{dateFormat.format(new Date(backup.createdAt))}</time></p>
            <code>{backup.path}</code>
            <p>{home ? 'O ficheiro fica na pasta backups do PC.' : 'Cole o caminho no Explorador de Ficheiros ou no assistente de restauro.'}</p>
          </>}
        </div>
        {!home && backup && busy !== 'backup' && <button className="text-button" onClick={() => void copyPath(backup.path)}>Copiar caminho</button>}
        <p className="local-file-feedback" role="status">{copyMessage}</p>
        {error?.action === 'backup' && <p role="alert" className="form-error">{error.message}</p>}
      </div>
      {home ? <p>A exportação JSON e o restauro estão disponíveis no PC.</p> : <div className="local-file-action">
        <h3>Ficheiro para consulta</h3>
        <p>Descarrega um JSON (versão 1) com todos os meses, planos, movimentos, contas, reservas e lembretes. Para recuperar a aplicação, use um backup SQLite.</p>
        <button className="button" aria-disabled={!!busy} onClick={() => void run('export')}>Exportar dados</button>
        <div className="local-file-feedback" role="status">
          {busy === 'export' && <p>A preparar a exportação…</p>}
          {exported && <p>Exportação preparada. Consulte as transferências do navegador para localizar <strong>o-meu-mes-exportacao.json</strong>.</p>}
        </div>
        {error?.action === 'export' && <p role="alert" className="form-error">{error.message}</p>}
      </div>}
    </div>
    {!home && <details className="restore-help">
      <summary>Restaurar para outro ficheiro</summary>
      <ol>
        <li>Na pasta do projeto, abra <strong>Restaurar.cmd</strong>.</li>
        <li>Cole o caminho do backup e escolha um nome novo para a cópia. Confira os dois caminhos antes de confirmar.</li>
        <li>Abra a cópia verificada pelo assistente. Para regressar à base habitual, pare esse servidor e abra <strong>Iniciar.cmd</strong>.</li>
      </ol>
    </details>}
  </section>;
}
