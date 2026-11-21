'use client';
import { useCallback, useRef } from 'react';
import { IdentityApp } from '@/modules/identity/ui/IdentityApp';
import { SpacesHome } from '@/modules/spaces/ui/SpacesHome';
import type { FinanceMemory } from '@/modules/finance/client/draft';
import { AcceptInvite } from '@/modules/spaces/ui/AcceptInvite';

export function Application() {
  const memory = useRef<FinanceMemory>({});
  const clear = useCallback(() => {
    memory.current = {};
  }, []);
  return (
    <IdentityApp
      clearWorkspace={clear}
      invitations={(owner) => <AcceptInvite key={owner} owner={owner} />}
      workspace={(owner, name, profile) => (
        <SpacesHome key={owner} owner={owner} name={name} memory={memory.current} profile={profile} />
      )}
    />
  );
}
