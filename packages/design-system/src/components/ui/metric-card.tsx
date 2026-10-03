import Link from 'next/link';
import { Card, CardDescription, CardTitle } from './card';

export interface MetricRow {
  label: string;
  value: string | number;
  href?: string;
}

// The one dashboard-summary shape every operational portal needs (Admin,
// Lab, Pharmacy, Panchakarma Centre) — a titled card that's either a single
// headline number (Revenue) or a short label→count breakdown
// (Verification queues, Payments by status). Consolidates what was ad hoc
// per-page JSX (admin/page.tsx originally hand-rolled this) into one place
// so every dashboard's metric cards look and behave the same way.
export function MetricCard({
  title,
  value,
  description,
  rows,
  href,
  emptyLabel = 'No data yet.',
}: {
  title: string;
  value?: string | number;
  description?: string;
  rows?: MetricRow[];
  href?: string;
  emptyLabel?: string;
}) {
  const content = (
    <Card className="h-full">
      <CardTitle className="text-base">{title}</CardTitle>
      {value !== undefined && <p className="mt-2 text-2xl font-semibold text-brand-neutral-900">{value}</p>}
      {description && <CardDescription>{description}</CardDescription>}
      {rows && rows.length === 0 && <CardDescription>{emptyLabel}</CardDescription>}
      {rows && rows.length > 0 && (
        <dl className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-brand-neutral-600">
                {row.href ? (
                  <Link href={row.href} className="text-brand-purple-600 underline decoration-brand-purple-200 underline-offset-2 hover:decoration-brand-purple-600">
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </dt>
              <dd className="font-medium text-brand-neutral-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
