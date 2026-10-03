import { cn } from '../../cn';

type Tone = 'info' | 'error' | 'success';

const TONE_CLASSES: Record<Tone, string> = {
  info: 'bg-brand-blue-50 text-brand-blue-800 border-brand-blue-200',
  error: 'bg-brand-magenta-50 text-brand-magenta-800 border-brand-magenta-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export function Alert({ tone = 'info', className, ...props }: { tone?: Tone } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-4 py-3 text-sm', TONE_CLASSES[tone], className)}
      {...props}
    />
  );
}
