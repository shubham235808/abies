import Link from 'next/link';
import { Button } from './button';

// Every list page in the app hand-rolled its own "nothing here" line
// (`<p className="text-sm text-brand-neutral-500">No orders yet.</p>`,
// repeated near-verbatim across a dozen files with slightly different
// wording/spacing each time). One component, consistent spacing/tone,
// with an optional action for the cases where the empty state should
// actually lead somewhere (e.g. "No appointments — find a doctor").
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mt-6 rounded-card border border-dashed border-brand-neutral-200 bg-white px-6 py-10 text-center">
      <p className="text-sm text-brand-neutral-500">{message}</p>
      {action && (
        <Link href={action.href} className="mt-4 inline-block">
          <Button variant="secondary" size="sm">
            {action.label}
          </Button>
        </Link>
      )}
    </div>
  );
}
