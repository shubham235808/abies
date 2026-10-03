import Link from 'next/link';
import { cn } from '../../cn';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right';
}

export interface DataTableSort {
  key: string;
  direction: 'asc' | 'desc';
}

// Server-renderable — sort is a Link that toggles a query param, same
// URL-driven-state pattern as Tabs (docs/PORTAL-UX-SPEC.md's "Search &
// Filter URL state" principle). A row's own primary cell should wrap its
// content in a Link when the row needs to navigate — this component
// doesn't invent a whole-row-click affordance, since that needs either
// client JS or a fragile CSS trick and every existing list page already
// links explicitly instead.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  sortHref,
  emptyMessage = 'Nothing here yet.',
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: DataTableSort;
  sortHref?: (key: string, direction: 'asc' | 'desc') => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-card border border-dashed border-brand-neutral-200 p-6 text-center text-sm text-brand-neutral-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-card border border-brand-neutral-200 bg-white shadow-sm">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-brand-neutral-200 bg-brand-neutral-50">
          <tr>
            {columns.map((col) => {
              const isSorted = sort?.key === col.key;
              const nextDirection: 'asc' | 'desc' = isSorted && sort?.direction === 'asc' ? 'desc' : 'asc';
              const content = (
                <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'justify-end')}>
                  {col.label}
                  {isSorted && <span aria-hidden="true">{sort?.direction === 'asc' ? '↑' : '↓'}</span>}
                </span>
              );
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={cn('px-4 py-3 font-medium text-brand-neutral-600', col.align === 'right' && 'text-right')}
                >
                  {col.sortable && sortHref ? (
                    <Link href={sortHref(col.key, nextDirection)} className="hover:text-brand-neutral-900">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-neutral-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-brand-neutral-50">
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 text-brand-neutral-900', col.align === 'right' && 'text-right')}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
