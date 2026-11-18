import { useEffect, useRef, useState } from 'react';
export function PaymentFeedback({
  lineId,
  text,
  expiresAt,
  onView,
}: {
  lineId: string;
  text: string;
  expiresAt: number;
  onView: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expired, setExpired] = useState(false),
    [focused, setFocused] = useState(false),
    [hidden, setHidden] = useState(() => Date.now() >= expiresAt);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  useEffect(() => {
    if (!expired || focused || ref.current?.contains(document.activeElement)) return;
    const timer = setTimeout(
      () => setHidden(true),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    );
    return () => clearTimeout(timer);
  }, [expired, focused]);
  return (
    <div
      ref={ref}
      className={`payment-feedback${expired && !focused ? ' leaving' : ''}`}
      hidden={hidden}
      id={`receipt-${lineId}`}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <p>{text}</p>
      <button className="text-button" onClick={onView}>
        Ver registo
      </button>
    </div>
  );
}
