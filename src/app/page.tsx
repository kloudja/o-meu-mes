import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { localAccess } from '@/server/access';
import { Application } from './Application';
export const dynamic='force-dynamic';
export default async function Page(){
  if(!localAccess(await headers()))notFound();
  return <Application/>;
}
