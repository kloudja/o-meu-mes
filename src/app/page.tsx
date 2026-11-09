import { App } from '@/components/App';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { accessMode } from '@/server/access';
export const dynamic = 'force-dynamic';
export function generateMetadata() { return { title: process.env.OMEUMES_TRIAL === '1' ? 'O meu mês · Ensaio fictício' : process.env.OMEUMES_RECOVERY_SCOPE ? 'O meu mês · Cópia recuperada' : 'O meu mês · Dados locais' }; }
export default async function Page() {
  const mode = accessMode(await headers());
  if (!mode) notFound();
  return <App home={mode === 'home'} recoveryScope={process.env.OMEUMES_RECOVERY_SCOPE} trial={process.env.OMEUMES_TRIAL === '1'} />;
}
