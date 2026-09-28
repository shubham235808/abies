'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

// Native <dialog> gets focus-trap, Escape-to-close, and top-layer stacking
// for free — no modal library needed (docs/ABIES-MOTION-SYSTEM.md §8's
// "no new runtime dependency unless justified" rule). Clicking the dialog
// element itself (not a child) means the click landed in the dialog's own
// padding/backdrop area, which is how native <dialog> click-outside-to-close
// is conventionally detected.
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'motion-fade-in m-auto w-full max-w-lg rounded-card border border-brand-neutral-200 bg-white p-6 shadow-2xl backdrop:bg-brand-neutral-900/50',
        className,
      )}
    >
      {title && <h2 className="text-lg font-semibold text-brand-neutral-900">{title}</h2>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </dialog>
  );
}
