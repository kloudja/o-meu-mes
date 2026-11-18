import type { ReactNode } from 'react';

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="form-error">
      {children}
    </p>
  );
}

export function StatusMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" className={className}>
      {children}
    </p>
  );
}
