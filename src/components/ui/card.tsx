import { cn } from '@/lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-card border border-brand-neutral-200 bg-white p-6 shadow-sm transition-all', className)}
      {...props}
    />
  );
}

// A clickable/hoverable card (catalogue items, profile cards) — lifts and
// picks up the brand-tinted elevated shadow on hover, matching the
// reference prototype's .profile-card/.product-card/.center-card hover
// treatment, instead of the static Card used for non-interactive panels.
export function HoverCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-brand-neutral-200 bg-white transition-all hover:-translate-y-1 hover:border-brand-purple-200 hover:shadow-brand',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold text-brand-neutral-900', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-sm text-brand-neutral-600', className)} {...props} />;
}
