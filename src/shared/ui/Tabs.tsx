import type { ReactNode } from 'react';

interface Props<T extends string> {
  label: string;
  panelId: string;
  className: string;
  selected: T;
  options: { id: T; label: ReactNode; count: number }[];
  onSelect: (id: T) => void;
}

export function Tabs<T extends string>({ options, selected, onSelect, label, panelId, className }: Props<T>) {
  return (
    <div className={className} role="tablist" aria-label={label}>
      {options.map(({ id, label, count }, index) => (
        <button
          role="tab"
          key={id}
          id={`tab-${id}`}
          aria-selected={selected === id}
          aria-controls={panelId}
          onClick={() => onSelect(id)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const offset = event.key === 'ArrowRight' ? 1 : -1;
            const next = options[(index + offset + options.length) % options.length].id;
            onSelect(next);
            document.getElementById(`tab-${next}`)?.focus();
          }}
          tabIndex={selected === id ? 0 : -1}
        >
          {label}
          <span>{count}</span>
        </button>
      ))}
    </div>
  );
}
