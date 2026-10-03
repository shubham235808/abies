import Link from 'next/link';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-brand-neutral-500">
      {items.map((item, i) => (
        <Fragment key={item.label}>
          {i > 0 && (
            <span aria-hidden="true" className="text-brand-neutral-300">
              /
            </span>
          )}
          {item.href ? (
            <Link href={item.href} className="hover:text-brand-purple-600">
              {item.label}
            </Link>
          ) : (
            <span className="text-brand-neutral-900" aria-current="page">
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
