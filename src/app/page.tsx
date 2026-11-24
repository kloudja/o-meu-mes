import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { applicationAccess } from '@/server/access';
import { Application } from './Application';
export const dynamic='force-dynamic';
export default async function Page(){
  if(!applicationAccess(await headers()))notFound();
  return <Application/>;
}
