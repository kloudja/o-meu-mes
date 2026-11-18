import { App } from '@/components/App';
import { featureFlags } from '@/config/feature-flags';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { localAccess } from '@/server/access';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  if(process.env.OMEUMES_RECOVERY_SCOPE)return {title:'O meu mês · Cópia recuperada'};
  return {title:featureFlags.localData?'O meu mês · Dados locais':'O meu mês'};
}
export default async function Page() {
  if (!localAccess(await headers())) notFound();
  return <App recoveryScope={process.env.OMEUMES_RECOVERY_SCOPE} showLocalData={featureFlags.localData}/>;
}
