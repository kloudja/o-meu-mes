'use client';
import { usePersistentStore } from '../client/usePersistentStore';
import { FinanceWorkspace } from './FinanceWorkspace';
import { StatusMessage, ErrorMessage } from '../../../shared/ui/Messages';
import { Button } from '../../../shared/ui/Button';
import { appText } from '../../../shared/i18n/pt-PT';

export function FinanceApp({
  recoveryScope,
  showLocalData,
}: {
  recoveryScope?: string;
  showLocalData: boolean;
}) {
  const store = usePersistentStore(recoveryScope);
  if (!store.state)
    return (
      <div className="app-shell storage-opening" data-ready="false">
        <h1>O meu mês</h1>
        <StatusMessage>{store.error ? 'Não foi possível abrir O meu mês.' : appText.loading}</StatusMessage>
        {store.error && (
          <>
            <ErrorMessage>{store.error}</ErrorMessage>
            <Button onClick={() => void store.refresh()}>Tentar novamente</Button>
          </>
        )}
      </div>
    );
  return (
    <FinanceWorkspace
      store={{ ...store, state: store.state }}
      recovery={!!recoveryScope}
      showLocalData={showLocalData}
    />
  );
}
