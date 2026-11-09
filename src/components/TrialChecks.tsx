'use client';
import { useEffect, useState } from 'react';

export function TrialChecks({ home }: { home: boolean }) {
  const [screen, setScreen] = useState<{ width:number; height:number; browser:string }>();
  const [results, setResults] = useState<{ name:string; status:number; expected:number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const measure = () => setScreen({ width:window.innerWidth, height:window.innerHeight, browser:navigator.userAgent });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  async function check() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const checks = [
        { name:'Consulta sem sessão', path:'/api/state', expected:401, options:{ credentials:'omit' as const } },
        { name:'Alteração sem sessão', path:'/api/state', expected:401, options:{
          credentials:'omit' as const, method:'POST', headers:{'Content-Type':'application/json'}, body:'{}',
        } },
        { name:'Exportação pela entrada doméstica', path:'/api/local-files?action=export', expected:403,
          options:{ method:'POST', credentials:'same-origin' as const } },
      ];
      setResults(await Promise.all(checks.map(async item => {
        const response = await fetch(item.path, { ...item.options, cache:'no-store', signal:AbortSignal.timeout(10_000) });
        await response.body?.cancel();
        return { name:item.name, status:response.status, expected:item.expected };
      })));
    } catch {
      setError('Verificação por confirmar. Confira a ligação e tente novamente.');
    } finally { setBusy(false); }
  }
  return <section className="panel local-files trial-checks" aria-labelledby="trial-checks-title">
    <h2 id="trial-checks-title">Verificações deste ensaio</h2>
    <p>Dados fictícios. Registe estes resultados para este aparelho.</p>
    {screen && <><p><strong>{screen.width} × {screen.height} px CSS</strong></p><p>{screen.browser}</p></>}
    {home && <>
      <p>Os pedidos sem sessão omitem o cookie. O pedido de alteração é vazio e inválido, sem qualquer operação financeira.</p>
      <button className="button" disabled={busy} onClick={() => void check()}>{busy?'A verificar…':'Verificar controlos de acesso'}</button>
      <div role="status">{results.map(result => <p key={result.name}>
        {result.name} · HTTP {result.status} · {result.status===result.expected?'Conforme':`Rever · esperado ${result.expected}`}
      </p>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>}
  </section>;
}
