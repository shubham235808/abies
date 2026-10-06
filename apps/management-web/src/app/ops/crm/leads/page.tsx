import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { getCurrentSession } from '@abies/domain/server/current-user';

// Roles that may download the lead export (same as the export route).
const EXPORT_ROLES: string[] = ['ADMIN', 'CRM_ADMIN', 'AUDITOR'];

type LeadRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  source: string;
  stage: string;
  assignedTo: { name: string | null; mobile: string } | null;
  createdAt: string;
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const key of ['q', 'stage', 'source', 'page'] as const) if (params[key]) qs.set(key, params[key]!);
  // Leads come from the database service, which applies the caller's scope.
  const res = await callDbService<{ leads: LeadRow[]; total: number; page: number; pageSize: number }>(
    `/db/v1/crm/leads?${qs.toString()}`,
    { sessionToken: token },
  );
  if (res.status === 401) redirect('/ops/login');
  if (res.status !== 200) throw new Error('Could not load leads');
  const session = await getCurrentSession();
  const canExport = !!session && EXPORT_ROLES.includes(session.user.role);
  const exportQs = new URLSearchParams();
  for (const key of ['stage', 'source'] as const) if (params[key]) exportQs.set(key, params[key]!);
  const exportHref = `/api/v1/crm/export/leads${exportQs.toString() ? `?${exportQs.toString()}` : ''}`;
  const { leads, total, page, pageSize } = res.body;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">Leads</h1>
          <p className="mt-1 text-sm text-brand-neutral-600">{total} lead{total === 1 ? '' : 's'} you can see</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <a href={exportHref} className="rounded-control border border-brand-neutral-200 px-4 py-2 text-sm font-semibold text-brand-neutral-800">
              Export CSV
            </a>
          )}
          <Link href="/ops/crm/leads/new" className="rounded-control bg-brand-purple-600 px-4 py-2 text-sm font-bold text-white">
            + New lead
          </Link>
        </div>
      </div>

      <form className="mt-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Name, mobile or email"
          className="min-w-[220px] flex-1 rounded-control border border-brand-neutral-200 px-3 py-2 text-sm"
        />
        <select name="stage" defaultValue={params.stage ?? ''} className="rounded-control border border-brand-neutral-200 px-3 py-2 text-sm">
          <option value="">All stages</option>
          {['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'FOLLOW_UP', 'CONVERTED', 'LOST', 'DUPLICATE', 'INVALID', 'DO_NOT_CONTACT'].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <button className="rounded-control border border-brand-neutral-200 px-3 py-2 text-sm font-semibold">Filter</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-control border border-brand-neutral-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-neutral-50 text-left text-brand-neutral-600">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Contact</th>
              <th className="px-4 py-2.5 font-semibold">Source</th>
              <th className="px-4 py-2.5 font-semibold">Stage</th>
              <th className="px-4 py-2.5 font-semibold">Owner</th>
              <th className="px-4 py-2.5 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-brand-neutral-500">
                  No leads match.
                </td>
              </tr>
            )}
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-brand-neutral-100">
                <td className="px-4 py-2.5">
                  <Link href={`/ops/crm/leads/${l.id}`} className="font-semibold text-brand-purple-700 underline">
                    {l.firstName} {l.lastName ?? ''}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{l.mobile ?? l.email ?? '—'}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{l.source.replaceAll('_', ' ')}</td>
                <td className="px-4 py-2.5">{l.stage.replaceAll('_', ' ')}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{l.assignedTo?.name ?? l.assignedTo?.mobile ?? 'Unassigned'}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{new Date(l.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-brand-neutral-600">
        <span>
          Page {page} of {pages}
        </span>
        <span className="flex gap-2">
          {page > 1 && <Link href={`?page=${page - 1}`} className="underline">Previous</Link>}
          {page < pages && <Link href={`?page=${page + 1}`} className="underline">Next</Link>}
        </span>
      </div>
    </div>
  );
}
