import Link from 'next/link';
import type { ReactNode } from 'react';

// The clickable "title / subtitle / meta line / trailing badge" card row
// repeated near-identically across every list page in the app (ticket
// queues, lab/pharmacy orders, admin verification queues, sales leads) —
// one component instead of re-hand-rolling the same div structure and
// hover styling in a dozen files.
export function ListRow({
  href,
  title,
  subtitle,
  meta,
  trailing,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Link href={href}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-purple-300">
        <div className="min-w-0">
          <p className="font-medium text-brand-neutral-900">{title}</p>
          {subtitle && <p className="mt-1 text-sm text-brand-neutral-600">{subtitle}</p>}
          {meta && <p className="mt-1 text-xs text-brand-neutral-400">{meta}</p>}
        </div>
        {trailing && <div className="flex shrink-0 flex-col items-end gap-1">{trailing}</div>}
      </div>
    </Link>
  );
}
