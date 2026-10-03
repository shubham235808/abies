import Link from 'next/link';

export interface TabItem {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

// URL-driven tabs (server-renderable, no client JS needed) — the same
// query-param-Link pattern already used by the admin verification queues,
// pulled out into one component instead of re-hand-rolling the active/
// inactive pill styling on every new tabbed list (Support queues, Sales
// pipeline).
export function Tabs({ items }: { items: TabItem[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-full border border-brand-neutral-200 px-3 py-1.5 text-sm ${
            item.active ? 'bg-brand-purple-600 text-white border-brand-purple-600' : 'bg-white text-brand-neutral-600 hover:bg-brand-neutral-100'
          }`}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={item.active ? 'ml-1.5 text-brand-purple-100' : 'ml-1.5 text-brand-neutral-400'}>{item.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
