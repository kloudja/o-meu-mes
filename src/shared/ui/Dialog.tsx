'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
export function Dialog({
  title,
  onClose,
  children,
  returnTo,
  eyebrow = 'REGISTO LOCAL DO MÊS',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  returnTo?: string;
  eyebrow?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const [previous] = useState(() => document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => {
      dialog?.close();
      if (returnTo) document.getElementById(returnTo)?.focus({ preventScroll: true });
      else if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [previous, returnTo]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab' || e.defaultPrevented) return;
        const controls = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button,a[href],input,select,textarea,summary,[tabindex]',
          ),
        ).filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onPointerDown={(e) => {
        backdropPress.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPress.current && e.target === e.currentTarget) onClose();
        backdropPress.current = false;
      }}
    >
      <div className="dialog-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Fechar diálogo" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
