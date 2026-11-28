'use client';

import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/ui/Icon';
import { calendarDate, monthLabel } from '../domain/money';

const months = [
  ['Janeiro', 'Fevereiro', 'Março'],
  ['Abril', 'Maio', 'Junho'],
  ['Julho', 'Agosto', 'Setembro'],
  ['Outubro', 'Novembro', 'Dezembro'],
];
const lastMonth = 9999 * 12 - 1;

function periodAt(index: number) {
  const year = Math.floor(index / 12) + 1;
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function MonthField({ value, onChange, disabled }: {
  value: string;
  onChange: (period: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeMonth = useRef<HTMLButtonElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const today = calendarDate().slice(0, 7);

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (!panel.open) panel.showModal();
    activeMonth.current?.focus();
  }, [cursor]);

  function close() {
    dialog.current?.close();
    setCursor(null);
    trigger.current?.focus({ preventScroll: true });
  }

  function navigate(event: KeyboardEvent<HTMLTableElement>) {
    if (cursor === null) return;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = cursor - 1; break;
      case 'ArrowRight': next = cursor + 1; break;
      case 'ArrowUp': next = cursor - 3; break;
      case 'ArrowDown': next = cursor + 3; break;
      case 'Home': next = cursor - (cursor % 3); break;
      case 'End': next = cursor + 2 - (cursor % 3); break;
      case 'PageUp': next = cursor >= 12 ? cursor - 12 : cursor; break;
      case 'PageDown': next = cursor <= lastMonth - 12 ? cursor + 12 : cursor; break;
      default: return;
    }
    event.preventDefault();
    setCursor(Math.max(0, Math.min(lastMonth, next)));
  }

  return (
    <div className="date-field">
      <label id={`${id}-label`} htmlFor={id}>Mês selecionado</label>
      <button ref={trigger} id={id} type="button" className="date-trigger" disabled={disabled}
        aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={cursor !== null}
        aria-controls={cursor !== null ? `${id}-calendar` : undefined}
        onClick={() => setCursor((Number(value.slice(0, 4)) - 1) * 12 + Number(value.slice(5)) - 1)}>
        <span id={`${id}-value`}><time dateTime={value}>{monthLabel(value)}</time></span>
        <Icon name="month" size={18} />
      </button>
      {cursor !== null && (
        <dialog ref={dialog} id={`${id}-calendar`} className="date-calendar month-calendar" aria-label="Escolher mês"
          onCancel={event => { event.preventDefault(); close(); }}
          onClick={event => { if (event.target === event.currentTarget) close(); }}>
          <div className="calendar-content">
            <div className="calendar-heading">
              <button type="button" className="icon-button" aria-label="Ano anterior" disabled={cursor < 12}
                onClick={() => setCursor(cursor - 12)}>
                <span className="calendar-previous"><Icon name="chevron" size={15} /></span>
              </button>
              <h3 id={`${id}-year`} aria-live="polite">{Math.floor(cursor / 12) + 1}</h3>
              <button type="button" className="icon-button" aria-label="Ano seguinte" disabled={cursor > lastMonth - 12}
                onClick={() => setCursor(cursor + 12)}>
                <span className="calendar-next"><Icon name="chevron" size={15} /></span>
              </button>
            </div>
            <table role="grid" aria-labelledby={`${id}-year`} onKeyDown={navigate}>
              <tbody>
                {months.map((row, rowIndex) => (
                  <tr key={row[0]}>
                    {row.map((name, column) => {
                      const index = cursor - (cursor % 12) + rowIndex * 3 + column;
                      const period = periodAt(index);
                      const focused = index === cursor;
                      return (
                        <td key={name} aria-selected={period === value}>
                          <button type="button" ref={focused ? activeMonth : undefined} tabIndex={focused ? 0 : -1}
                            aria-label={monthLabel(period)} aria-current={period === today ? 'date' : undefined}
                            onClick={() => { close(); onChange(period); }}>{name}</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="calendar-actions">
              <button type="button" className="button" onClick={close}>Cancelar</button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
