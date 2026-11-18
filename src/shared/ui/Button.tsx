import type { ComponentPropsWithoutRef } from 'react';

type Props = ComponentPropsWithoutRef<'button'> & { variant?: 'default' | 'primary' | 'text' };

export function Button({ variant = 'default', className, ...props }: Props) {
  const style = { default: 'button', primary: 'button primary', text: 'text-button' }[variant];
  return <button {...props} className={[style, className].filter(Boolean).join(' ')} />;
}
