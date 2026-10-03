'use client';

import { useEffect, useRef } from 'react';
import { cn } from '../../cn';

// Same native-<dialog> foundation as Modal, positioned to an edge instead
// of centered — see modal.tsx's comment for why <dialog> over a library.
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
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
        'fixed inset-y-0 m-0 h-full max-h-none w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl backdrop:bg-brand-neutral-900/50',
        side === 'right' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {title && <h2 className="text-lg font-semibold text-brand-neutral-900">{title}</h2>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </dialog>
  );
}
