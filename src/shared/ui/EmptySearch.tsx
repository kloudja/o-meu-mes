import { Button } from './Button';
import { appText } from '../i18n/pt-PT';

export function EmptySearch({ onClear }: { onClear: () => void }) {
  return (
    <div className="empty">
      <h3>{appText.noResults}</h3>
      <Button variant="text" onClick={onClear}>
        {appText.clearSearch}
      </Button>
    </div>
  );
}
