'use client';

import { type KeyboardEvent, type ReactNode, type RefObject, useId, useLayoutEffect, useRef, useState } from 'react';
import { locale } from '@/shared/i18n/pt-PT';
import { Icon } from '@/shared/ui/Icon';
import { calendarDate, dateLabel, monthLabel } from '../domain/money';
import { daysInMonth } from '../domain/validation';

const weekdays = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
const asUtcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const dayCount = (period: string) => daysInMonth(Number(period.slice(0, 4)), Number(period.slice(5)));
const dayIn = (period: string, day: number) => `${period}-${String(day).padStart(2, '0')}`;
const weekday = (iso: string) => (asUtcDate(iso).getUTCDay() + 6) % 7;

function moveDays(iso: string, days: number) {
  const date = asUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  if (date.getUTCFullYear() < 1) return '0001-01-01';
  if (date.getUTCFullYear() > 9999) return '9999-12-31';
  return date.toISOString().slice(0, 10);
}

function moveMonths(iso: string, months: number) {
  const date = asUtcDate(iso);
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  if (date.getUTCFullYear() < 1) return '0001-01-01';
  if (date.getUTCFullYear() > 9999) return '9999-12-31';
  const period = date.toISOString().slice(0, 7);
  return dayIn(period, Math.min(Number(iso.slice(8)), dayCount(period)));
}

export function DateField({
  label, value, onChange, period, optional, disabled, invalid, describedBy, error, buttonRef,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  period?: string;
  optional?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  error?: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId();
  const ownButton = useRef<HTMLButtonElement>(null);
  const trigger = buttonRef ?? ownButton;
  const dialog = useRef<HTMLDialogElement>(null);
  const activeDay = useRef<HTMLButtonElement>(null);
  const [cursor, setCursor] = useState('');
  const open = cursor !== '';
  const today = calendarDate();
  const min = period ? dayIn(period, 1) : '0001-01-01';
  const max = period ? dayIn(period, dayCount(period)) : '9999-12-31';
  const clamp = (day: string) => day < min ? min : day > max ? max : day;
  const month = cursor.slice(0, 7);
  const firstDay = open ? weekday(dayIn(month, 1)) : 0;
  const lastDay = open ? dayCount(month) : 0;

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (!panel.open) panel.showModal();
    activeDay.current?.focus();
  }, [cursor]);

  function close() {
    dialog.current?.close();
    setCursor('');
    trigger.current?.focus({ preventScroll: true });
  }

  function choose(day: string) {
    close();
    onChange(day);
  }

  function navigate(event: KeyboardEvent<HTMLTableElement>) {
    let next: string;
    switch (event.key) {
      case 'ArrowLeft': next = moveDays(cursor, -1); break;
      case 'ArrowRight': next = moveDays(cursor, 1); break;
      case 'ArrowUp': next = moveDays(cursor, -7); break;
      case 'ArrowDown': next = moveDays(cursor, 7); break;
      case 'Home': next = moveDays(cursor, -weekday(cursor)); break;
      case 'End': next = moveDays(cursor, 6 - weekday(cursor)); break;
      case 'PageUp': next = period ? cursor : moveMonths(cursor, event.shiftKey ? -12 : -1); break;
      case 'PageDown': next = period ? cursor : moveMonths(cursor, event.shiftKey ? 12 : 1); break;
      default: return;
    }
    event.preventDefault();
    setCursor(clamp(next));
  }

  function keepFocus(event: KeyboardEvent<HTMLDialogElement>) {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([tabindex="-1"])');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.target === (event.shiftKey ? first : last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }

  const changeMonth = (months: number, name: string, reverse = false) => {
    const next = clamp(moveMonths(cursor, months));
    return (
      <button type="button" className="icon-button" aria-label={name} disabled={next.slice(0, 7) === month}
        onClick={() => setCursor(next)}>
        <span className={reverse ? 'calendar-previous' : 'calendar-next'}>
          <Icon name="chevron" size={15} />
          {Math.abs(months) === 12 && <Icon name="chevron" size={15} />}
        </span>
      </button>
    );
  };

  return (
    <div className="date-field">
      <label id={`${id}-label`} htmlFor={id}>{label}</label>
      <button ref={trigger} id={id} type="button" className="date-trigger" disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined}
        aria-labelledby={`${id}-label ${id}-value`} aria-invalid={invalid} aria-describedby={describedBy}
        onClick={() => setCursor(clamp(value || (period && !today.startsWith(period) ? min : today)))}>
        <span id={`${id}-value`}>{value ? <time dateTime={value}>{dateLabel(value)}</time> : 'Por indicar'}</span>
        <Icon name="month" size={18} />
      </button>
      {error}
      {open && (
        <dialog ref={dialog} id={`${id}-calendar`} className="date-calendar" aria-label="Calendário"
          onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
          onKeyDown={keepFocus}
          onClick={event => {
            event.stopPropagation();
            if (event.target === event.currentTarget) close();
          }}>
          <div className="calendar-content">
            <div className="calendar-heading">
              {!period && <div>{changeMonth(-12, 'Ano anterior', true)}{changeMonth(-1, 'Mês anterior', true)}</div>}
              <h3 id={`${id}-month`} aria-live="polite">{monthLabel(month)}</h3>
              {!period && <div>{changeMonth(1, 'Mês seguinte')}{changeMonth(12, 'Ano seguinte')}</div>}
            </div>
            <table role="grid" aria-labelledby={`${id}-month`} onKeyDown={navigate}>
              <thead><tr>{weekdays.map(name => <th key={name} scope="col" abbr={name}>{name.slice(0, 3)}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: Math.ceil((firstDay + lastDay) / 7) }, (_, week) => (
                  <tr key={week}>
                    {weekdays.map((name, column) => {
                      const day = week * 7 + column - firstDay + 1;
                      if (day < 1 || day > lastDay) return <td key={name} />;
                      const iso = dayIn(month, day);
                      const focused = iso === cursor;
                      return (
                        <td key={name} aria-selected={iso === value}>
                          <button type="button" ref={focused ? activeDay : undefined} tabIndex={focused ? 0 : -1}
                            aria-label={fullDate.format(asUtcDate(iso))} aria-current={iso === today ? 'date' : undefined}
                            onClick={() => choose(iso)}>{day}</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="calendar-actions">
              {optional && value && <button type="button" className="text-button" onClick={() => choose('')}>Limpar data</button>}
              <button type="button" className="button" onClick={close}>Cancelar</button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
