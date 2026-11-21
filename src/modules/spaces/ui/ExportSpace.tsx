'use client';
import { useLayoutEffect, useRef, useState } from 'react';
export function ExportSpace({ space, account }: { space: string; account: string }) {
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    setBusy(false);
    setStatus('');
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [account, space]);
  async function run() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setStatus('');
    try {
      const send = async (body: unknown) => {
        const r = await fetch('/api/export?spaceId=' + encodeURIComponent(space), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Account': account },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.message);
        return data;
      };
      const { token } = await send({ action: 'prepare' });
      const result = await send({ action: 'download', token });
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'o-meu-mes-espaco.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Exportação preparada para guardar.');
    } catch (e) {
      if (!controller.signal.aborted) setStatus((e as Error).message);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <details className="privacy-export">
      <summary>Exportação do espaço</summary>
      <p>O ficheiro JSON inclui os meses e os movimentos deste espaço. Guarda-o num local privado.</p>
      <button className="button" disabled={busy} onClick={() => void run()}>
        Guardar ficheiro JSON
      </button>
      {status && <p role="status">{status}</p>}
    </details>
  );
}
