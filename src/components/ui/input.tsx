import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const FIELD_CLASSES =
  'w-full rounded-lg border border-brand-neutral-200 bg-white px-3.5 py-2.5 text-sm text-brand-neutral-900 placeholder:text-brand-neutral-400 focus:border-brand-purple-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-purple-200 disabled:bg-brand-neutral-50 disabled:text-brand-neutral-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(FIELD_CLASSES, className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(FIELD_CLASSES, className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(FIELD_CLASSES, className)} {...props} />,
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-brand-neutral-800', className)} {...props} />;
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm text-brand-magenta-600">
      {children}
    </p>
  );
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-sm text-brand-neutral-400">{children}</p>;
}
