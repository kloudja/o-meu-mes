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
  ...props
}: OptionList & Omit<ComponentPropsWithoutRef<'select'>, 'children'> & { placeholder?: string }) {
  const empty = options.length === 0;
  return (
    <select {...props} value={empty ? '' : value} disabled={disabled || empty}>
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
}: OptionList & {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  invalid?: boolean;
  error?: React.ReactNode;
}) {
  const id = useId(),
    listId = `${id}-options`;
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false),
    [filter, setFilter] = useState(''),
    [draft, setDraft] = useState(''),
    [highlight, setHighlight] = useState(-1);
  const empty = options.length === 0;
  const selected = options.find((option) => option.id === value);
  useLayoutEffect(() => {
    if (open) list.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  const visible = options.filter((option) => matchesText(option.name, filter));
  const showAll = () => {
    setOpen(true);
    setFilter('');
    setHighlight(-1);
  };
  const choose = (id: string) => {
    onChange(id);
    setDraft('');
    setOpen(false);
  };
  return (
    <div
      className="choice"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="choice-field">
        <input
          ref={input}
          id={id}
          name={name}
          role="combobox"
          disabled={empty}
          aria-expanded={!empty && open}
          aria-controls={!empty && open ? listId : undefined}
          aria-activedescendant={open && visible[highlight] ? `${listId}-${highlight}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Pesquisar ou escolher…"
          value={empty ? emptyLabel : (selected?.name ?? draft)}
          required={required}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'form-error' : undefined}
          onClick={() => {
            if (!open) showAll();
          }}
          onChange={(e) => {
            onChange('');
            setDraft(e.target.value);
            setFilter(e.target.value);
            setHighlight(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === 'Enter' && open && visible[highlight]) {
              e.preventDefault();
              choose(visible[highlight].id);
              return;
            }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            if (!open) {
              showAll();
              setHighlight(e.key === 'ArrowDown' ? 0 : options.length - 1);
              return;
            }
            const next =
              e.key === 'ArrowDown'
                ? Math.min(highlight + 1, visible.length - 1)
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
            if (open) setOpen(false);
            else showAll();
          }}
        >
          <Icon name="chevron" size={17} />
        </button>
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
