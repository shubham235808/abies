import { cn } from '../../cn';

export interface ProgressStep {
  label: string;
  status: 'done' | 'current' | 'upcoming';
  detail?: string;
}

// The "Session 1 ✓ · Session 2 Today · Session 3 Scheduled" course-progress
// indicator the brief asks for on Panchakarma bookings — built generically
// enough to also fit a care plan's step sequence, since both are "N ordered
// steps, some done, one current, the rest upcoming" shapes. Wraps to a
// vertical stack on narrow screens instead of a horizontal bar that would
// clip (docs/PORTAL-UX-SPEC.md's mobile-strategy note for this component).
export function ProgressSteps({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              step.status === 'done' && 'bg-emerald-100 text-emerald-700',
              step.status === 'current' && 'bg-brand-purple-100 text-brand-purple-700',
              step.status === 'upcoming' && 'bg-brand-neutral-100 text-brand-neutral-400',
            )}
          >
            {step.status === 'done' ? '✓' : i + 1}
          </span>
          <span className={cn('text-sm', step.status === 'upcoming' ? 'text-brand-neutral-400' : 'text-brand-neutral-800')}>
            {step.label}
            {step.detail && <span className="text-brand-neutral-400"> — {step.detail}</span>}
          </span>
          {i < steps.length - 1 && <span className="hidden text-brand-neutral-300 sm:inline">·</span>}
        </li>
      ))}
    </ol>
  );
}
