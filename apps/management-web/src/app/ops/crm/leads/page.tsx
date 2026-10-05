import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@abies/domain/server/current-user';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { listLeads } from '@abies/domain/modules/crm/leads.service';
import { listLeadsSchema } from '@abies/domain/modules/crm/leads.schemas';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getCurrentSession();
  if (!session) redirect('/ops/login');
  const params = await searchParams;
  const query = listLeadsSchema.parse({ q: params.q, stage: params.stage, source: params.source, page: params.page });
  const { leads, total, page, pageSize } = await listLeads(query, crmActorFromSession(session));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">Leads</h1>
          <p className="mt-1 text-sm text-brand-neutral-600">{total} lead{total === 1 ? '' : 's'} you can see</p>
        </div>
        <Link href="/ops/crm/leads/new" className="rounded-control bg-brand-purple-600 px-4 py-2 text-sm font-bold text-white">
          + New lead
        </Link>
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
                <td className="px-4 py-2.5 text-brand-neutral-600">{l.createdAt.toLocaleDateString('en-IN')}</td>
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
