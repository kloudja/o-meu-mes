import { FinanceApp } from '@/modules/finance/ui/FinanceApp';
import { readServerSettings } from '@/config/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { localAccess } from '@/server/access';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  const { recoveryScope, showLocalData } = readServerSettings();
  if(recoveryScope)return {title:'O meu mês · Cópia recuperada'};
  return {title:showLocalData?'O meu mês · Dados locais':'O meu mês'};
}
export default async function Page() {
  if (!localAccess(await headers())) notFound();
  return <FinanceApp {...readServerSettings()}/>;
}
