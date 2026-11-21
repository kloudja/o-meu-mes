import type { DuplicateNotice } from '../contracts/command';
import { dateLabel, money } from '../domain/money';
import { Dialog } from '../../../shared/ui/Dialog';

export function recordedAt(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon',
  }).format(new Date(value));
}

export function DuplicateReview({ notice, busy, onConfirm, onClose, refresh }: {
  notice: DuplicateNotice;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  refresh?: () => void;
}) {
  return (
    <Dialog title="Possível duplicado" onClose={onClose}>
      <div className="dialog-body duplicate-review">
        {refresh && <OutdatedNotice refresh={refresh}/>}
        <p>{notice.entries.length
          ? 'Confirme se este montante corresponde a uma operação diferente.'
          : 'Os registos mudaram desde o aviso anterior. Reveja a confirmação.'}</p>
        <div className="history">
          {notice.entries.map((entry) => <div key={entry.id}>
            <div>
              <strong>{entry.description} · {money(entry.amount)}</strong>
              <small>Data do movimento: {dateLabel(entry.date)}</small>
              <small>{entry.author ? `Registado por ${entry.author}` : 'Autoria histórica não disponível'} · {recordedAt(entry.createdAt)}</small>
              <small>{Object.values(entry.sourceNames).join(' · ')}</small>
            </div>
          </div>)}
        </div>
      </div>
      <div className="dialog-footer">
        <button className="button" disabled={busy} onClick={onClose}>Voltar ao registo</button>
        <button className="button primary" disabled={busy || !!refresh} onClick={onConfirm}>Registar como operação diferente</button>
      </div>
    </Dialog>
  );
}

export function OutdatedNotice({ refresh }: { refresh: () => void }) {
  return <div className="callout" role="alert">
    <p>Os dados podem estar desatualizados.</p>
    <button type="button" className="button" onClick={refresh}>Atualizar dados</button>
  </div>;
}
