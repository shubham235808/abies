'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '../../cn';

type ToastTone = 'success' | 'danger' | 'info';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-l-4 border-[var(--color-semantic-success-500)]',
  danger: 'border-l-4 border-[var(--color-semantic-danger-500)]',
  info: 'border-l-4 border-[var(--color-semantic-info-500)]',
};

const TOAST_DURATION_MS = 4000;

// One provider mounted once at the root (src/app/layout.tsx) so any client
// component anywhere can call useToast().show(...) — matches this app's
// existing "one shared thing, not eleven local re-implementations"
// component discipline.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'motion-rise-in pointer-events-auto max-w-sm rounded-card border border-brand-neutral-200 bg-white px-4 py-3 text-sm text-brand-neutral-900 shadow-lg',
              TONE_CLASSES[t.tone],
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
