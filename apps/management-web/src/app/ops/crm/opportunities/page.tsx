import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { errorMessage, formatDate, formatRupees, linkWith, personName } from '../_lib/format';

type OpportunityRow = {
  id: string;
  title: string;
  service: string | null;
  expectedValue: number;
  probability: number;
  status: 'OPEN' | 'WON' | 'LOST';
  expectedCloseAt: string | null;
  lead: { id: string; firstName: string; lastName: string | null } | null;
  owner: { id: string; name: string | null; mobile: string } | null;
};

type Assignee = { id: string; name: string | null; mobile: string; role: string };

const STATUS_TABS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
  { value: 'all', label: 'All' },
] as const;

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');
  const params = await searchParams;

  const requested = params.status;
  const status = STATUS_TABS.some((t) => t.value === requested) ? requested! : 'OPEN';
  const ownerId = params.ownerId || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const qs = new URLSearchParams({ page: String(page) });
  if (status !== 'all') qs.set('status', status);
  if (ownerId) qs.set('ownerId', ownerId);

  const [res, assignees] = await Promise.all([
    callDbService<{ opportunities: OpportunityRow[]; total: number; page: number; pageSize: number }>(
      `/db/v1/crm/opportunities?${qs.toString()}`,
      { sessionToken: token },
    ),
    callDbService<{ users: Assignee[] }>('/db/v1/crm/assignees', { sessionToken: token }),
  ]);
  if (res.status === 401 || assignees.status === 401) redirect('/ops/login');

  const owners = assignees.status === 200 ? assignees.body.users : [];
  const filterParams = { status: status === 'OPEN' ? undefined : status, ownerId };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-brand-neutral-900">Opportunities</h1>
        {res.status === 200 && (
          <p className="mt-1 text-sm text-brand-neutral-600">
            {res.body.total} {STATUS_TABS.find((t) => t.value === status)?.label.toLowerCase()} opportunit{res.body.total === 1 ? 'y' : 'ies'} you can see
          </p>
        )}
      </div>
      <Link href="/ops/crm/opportunities/new" className="rounded-control bg-brand-purple-600 px-4 py-2 text-sm font-bold text-white">
        + New opportunity
      </Link>
    </div>
  );

  if (res.status !== 200) {
    return (
      <div>
        {header}
        <Alert tone="error" className="mt-4">{errorMessage(res.body, 'Could not load opportunities. Try again in a moment.')}</Alert>
      </div>
    );
  }

  const { opportunities, total, pageSize } = res.body;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {header}

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Opportunity status">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.value}
            href={linkWith({}, { status: t.value === 'OPEN' ? undefined : t.value, ownerId })}
            aria-current={status === t.value ? 'page' : undefined}
            className={
              'rounded-full px-3.5 py-1.5 text-sm font-semibold ' +
              (status === t.value
                ? 'bg-brand-purple-600 text-white'
                : 'border border-brand-neutral-200 bg-white text-brand-neutral-700 hover:bg-brand-purple-50')
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="status" value={status} />
        <select name="ownerId" defaultValue={ownerId ?? ''} className="rounded-control border border-brand-neutral-200 px-3 py-2 text-sm">
          <option value="">All owners</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.mobile}
            </option>
          ))}
        </select>
        <button className="rounded-control border border-brand-neutral-200 px-3 py-2 text-sm font-semibold">Filter</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-control border border-brand-neutral-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-neutral-50 text-left text-brand-neutral-600">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Opportunity</th>
              <th className="px-4 py-2.5 font-semibold">Lead</th>
              <th className="px-4 py-2.5 font-semibold">Owner</th>
              <th className="px-4 py-2.5 text-right font-semibold">Value</th>
              <th className="px-4 py-2.5 text-right font-semibold">Probability</th>
              <th className="px-4 py-2.5 font-semibold">Expected close</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-brand-neutral-500">
                  {status === 'OPEN'
                    ? 'No open opportunities. Create one when a lead is ready to buy.'
                    : `No ${status === 'all' ? '' : status.toLowerCase() + ' '}opportunities match.`}
                </td>
              </tr>
            )}
            {opportunities.map((o) => (
              <tr key={o.id} className="border-t border-brand-neutral-100">
                <td className="px-4 py-2.5">
                  <Link href={`/ops/crm/opportunities/${o.id}`} className="font-semibold text-brand-purple-700 underline">
                    {o.title}
                  </Link>
                  {o.service && <div className="text-xs text-brand-neutral-500">{o.service}</div>}
                </td>
                <td className="px-4 py-2.5">
                  {o.lead ? (
                    <Link href={`/ops/crm/leads/${o.lead.id}`} className="text-brand-neutral-700 underline">
                      {personName(o.lead)}
                    </Link>
                  ) : (
                    <span className="text-brand-neutral-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{o.owner ? o.owner.name ?? o.owner.mobile : 'Unassigned'}</td>
                <td className="px-4 py-2.5 text-right font-medium text-brand-neutral-900">{formatRupees(o.expectedValue)}</td>
                <td className="px-4 py-2.5 text-right text-brand-neutral-600">{o.probability}%</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{formatDate(o.expectedCloseAt)}</td>
                <td className="px-4 py-2.5">{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-brand-neutral-600">
        <span>
          Page {page} of {pages}
        </span>
        <span className="flex gap-3">
          {page > 1 && (
            <Link href={linkWith(filterParams, { page: String(page - 1) })} className="underline">
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={linkWith(filterParams, { page: String(page + 1) })} className="underline">
              Next
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
