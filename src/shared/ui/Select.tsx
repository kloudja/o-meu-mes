'use client';
import { useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { locale } from '../i18n/pt-PT';
import { matchesText } from '../i18n/text';
import { Icon } from './Icon';
type Option = { id: string; name: string };
type OptionList = { options: Option[]; emptyLabel: string };

export function Select({
  options,
  emptyLabel,
  placeholder,
  value,
  disabled,
  className,
  ...props
}: OptionList & Omit<ComponentPropsWithoutRef<'select'>, 'children'> & { placeholder?: string }) {
  const empty = options.length === 0;
  return (
    <select
      {...props}
      className={className ? `select ${className}` : 'select'}
      value={empty ? '' : value}
      disabled={disabled || empty}
    >
      {empty ? (
        <option value="">{emptyLabel}</option>
      ) : (
        <>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </>
      )}
    </select>
  );
}

export function Choice({
  label,
  name,
  options,
  emptyLabel,
  value,
  onChange,
  required = false,
  invalid = false,
  error,
  initialFocus,
  clearLabel,
}: OptionList & {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  invalid?: boolean;
  error?: React.ReactNode;
  initialFocus?: boolean;
  clearLabel?: string;
}) {
  const id = useId(),
    listId = `${id}-options`;
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false),
    [filter, setFilter] = useState<string | null>(null),
    [highlight, setHighlight] = useState(-1);
  const empty = options.length === 0;
  useLayoutEffect(() => {
    if (open) list.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  const choices = clearLabel && !empty ? [{ id: '', name: clearLabel }, ...options] : options;
  const selected = options.find((option) => option.id === value);
  const visible = choices.filter((option) => matchesText(option.name, filter ?? ''));
  const close = () => {
    setOpen(false);
    setFilter(null);
    setHighlight(-1);
  };
  const showAll = () => {
    setOpen(true);
    setFilter(null);
    setHighlight(-1);
    input.current?.select();
  };
  const choose = (id: string) => {
    onChange(id);
    close();
  };
  return (
    <div
      className="choice"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="choice-field">
        <input
          ref={input}
          id={id}
          name={name}
          data-initial-focus={initialFocus || undefined}
          role="combobox"
          disabled={empty}
          aria-expanded={!empty && open}
          aria-controls={!empty && open ? listId : undefined}
          aria-activedescendant={open && visible[highlight] ? `${listId}-${highlight}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={clearLabel ?? 'Pesquisar ou escolher…'}
          value={empty ? emptyLabel : (filter ?? selected?.name ?? '')}
          required={required}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'form-error' : undefined}
          onClick={() => {
            if (!open) showAll();
          }}
          onChange={(e) => {
            setFilter(e.target.value);
            setHighlight(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.preventDefault();
              close();
              return;
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault();
              const option = visible[highlight] ?? (visible.length === 1 ? visible[0] : undefined);
              if (option) choose(option.id);
              return;
            }
            if (e.key === 'Enter' && !open) {
              e.preventDefault();
              showAll();
              return;
            }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            if (!open) {
              showAll();
              const selectedIndex = choices.findIndex((option) => option.id === value);
              setHighlight(
                selectedIndex >= 0 ? selectedIndex : e.key === 'ArrowDown' ? 0 : choices.length - 1,
              );
              return;
            }
            if (!visible.length) return;
            const next =
              e.key === 'ArrowDown'
                ? Math.min(highlight + 1, visible.length - 1)
                : highlight < 0
                  ? visible.length - 1
                  : Math.max(highlight - 1, 0);
            setHighlight(next);
            list.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          }}
        />
        <button
          type="button"
          className="choice-toggle"
          disabled={empty}
          tabIndex={-1}
          aria-label={`Mostrar opções de ${label.toLocaleLowerCase(locale)}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            input.current?.focus();
            if (open) close();
            else showAll();
          }}
        ></button>
        {!empty && open && (
          <ul ref={list} id={listId} className="choice-options" role="listbox" aria-label={label}>
            {visible.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.id === value}
                data-highlighted={highlight === index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option.id)}
              >
                {option.name}
                {option.id === value && <Icon name="check" size={15} />}
              </li>
            ))}
            {visible.length === 0 && (
              <li className="choice-empty" role="presentation">
                Sem resultados
              </li>
            )}
          </ul>
        )}
      </div>
      {error}
    </div>
  );
}
