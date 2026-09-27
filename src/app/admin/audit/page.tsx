import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { listAuditEvents, listDistinctEventTypes } from '@/modules/audit/audit.service';

interface SearchParams {
  eventType?: string;
  resourceType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Number(params.page ?? '1') || 1;
  const [eventTypes, { events, total, pageCount }] = await Promise.all([
    listDistinctEventTypes(),
    listAuditEvents(
      { eventType: params.eventType, resourceType: params.resourceType, userId: params.userId, from: params.from, to: params.to },
      page,
    ),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Audit log</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Immutable record of every sensitive action — login, verification transitions, payments, refunds, support
        escalations. {total} matching event(s).
      </p>

      <Card className="mt-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="eventType">Event type</Label>
            <Select id="eventType" name="eventType" defaultValue={params.eventType ?? ''}>
              <option value="">All</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="resourceType">Resource type</Label>
            <Input id="resourceType" name="resourceType" defaultValue={params.resourceType ?? ''} placeholder="e.g. SupportTicket" />
          </div>
          <div>
            <Label htmlFor="userId">Actor user id</Label>
            <Input id="userId" name="userId" defaultValue={params.userId ?? ''} placeholder="cuid..." />
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit">Filter</Button>
            <Link href="/admin/audit">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-brand-neutral-200 text-xs uppercase tracking-wide text-brand-neutral-500">
              <th className="py-2 pr-4">When</th>
              <th className="py-2 pr-4">Actor</th>
              <th className="py-2 pr-4">Event</th>
              <th className="py-2 pr-4">Action</th>
              <th className="py-2 pr-4">Resource</th>
              <th className="py-2 pr-4">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-brand-neutral-100 align-top">
                <td className="py-2 pr-4 whitespace-nowrap text-brand-neutral-500">
                  {e.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {e.user ? `${e.user.mobile} (${e.user.role})` : <span className="text-brand-neutral-400">system</span>}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap font-medium text-brand-neutral-900">{e.eventType}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{e.action}</td>
                <td className="py-2 pr-4 whitespace-nowrap text-brand-neutral-500">
                  {e.resourceType ? `${e.resourceType}${e.resourceId ? ` · ${e.resourceId}` : ''}` : '—'}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-brand-neutral-500">
                  {e.metadata ? JSON.stringify(e.metadata) : ''}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-brand-neutral-500">
                  No matching events.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...params, page: String(page - 1) } as Record<string, string>).toString()}`}
              className="text-brand-purple-600 underline"
            >
              Previous
            </Link>
          )}
          <span className="text-brand-neutral-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...params, page: String(page + 1) } as Record<string, string>).toString()}`}
              className="text-brand-purple-600 underline"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
