import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 text-white shadow-[0_8px_22px_rgba(166,10,128,0.18)] hover:-translate-y-px disabled:from-brand-purple-300 disabled:to-brand-purple-300 disabled:shadow-none disabled:translate-y-0',
  secondary:
    'bg-white text-brand-purple-700 border border-brand-neutral-200 hover:bg-brand-purple-50 disabled:text-brand-neutral-400 disabled:border-brand-neutral-200',
  ghost: 'bg-brand-purple-50 text-brand-purple-700 hover:bg-brand-purple-100 disabled:bg-brand-neutral-100 disabled:text-brand-neutral-400',
  danger: 'bg-brand-magenta-600 text-white hover:bg-brand-magenta-700 disabled:bg-brand-magenta-300',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-[18px] py-3 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple-500 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4Z" />
        </svg>
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
