import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { enumLabel, errorMessage, personName } from '../_lib/format';

const STAGES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'FOLLOW_UP', 'CONVERTED', 'LOST', 'DUPLICATE', 'INVALID', 'DO_NOT_CONTACT',
] as const;

type LeadRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  assignedTo: { name: string | null; mobile: string } | null;
};

type Column = { stage: string; total: number; leads: LeadRow[]; error: string | null };

export default async function PipelinePage() {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');

  const columns: Column[] = await Promise.all(
    STAGES.map(async (stage): Promise<Column> => {
      const res = await callDbService<{ leads: LeadRow[]; total: number }>(`/db/v1/crm/leads?stage=${stage}&pageSize=10`, {
        sessionToken: token,
      });
      if (res.status === 401) redirect('/ops/login');
      if (res.status !== 200) return { stage, total: 0, leads: [], error: errorMessage(res.body, 'Could not load this stage.') };
      return { stage, total: res.body.total, leads: res.body.leads, error: null };
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Pipeline</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        Leads by stage. This view is read-only for now: open a lead to change its stage.
      </p>

      <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-3">
        {columns.map((col) => (
          <section
            key={col.stage}
            aria-labelledby={`stage-${col.stage}`}
            className="flex w-[240px] shrink-0 snap-start flex-col rounded-control border border-brand-neutral-100 bg-brand-neutral-50"
          >
            <header className="flex items-center justify-between gap-2 border-b border-brand-neutral-100 px-3 py-2.5">
              <h2 id={`stage-${col.stage}`} className="text-sm font-semibold text-brand-neutral-800">
                {enumLabel(col.stage)}
              </h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-brand-neutral-700">{col.total}</span>
            </header>

            <div className="flex flex-1 flex-col gap-2 p-2.5">
              {col.error && <Alert tone="error" className="px-3 py-2 text-xs">{col.error}</Alert>}
              {!col.error && col.leads.length === 0 && <p className="px-1 py-4 text-center text-xs text-brand-neutral-500">No leads here.</p>}
              {col.leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/ops/crm/leads/${l.id}`}
                  className="rounded-lg border border-brand-neutral-200 bg-white p-2.5 text-sm hover:border-brand-purple-200"
                >
                  <div className="font-semibold text-brand-neutral-900">{personName(l)}</div>
                  <div className="mt-0.5 truncate text-xs text-brand-neutral-500">{l.mobile ?? l.email ?? 'No contact'}</div>
                  <div className="mt-0.5 truncate text-xs text-brand-neutral-500">
                    {l.assignedTo ? l.assignedTo.name ?? l.assignedTo.mobile : 'Unassigned'}
                  </div>
                </Link>
              ))}
              {col.total > col.leads.length && (
                <Link href={`/ops/crm/leads?stage=${col.stage}`} className="px-1 pt-1 text-xs font-semibold text-brand-purple-700 underline">
                  View all {col.total}
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
