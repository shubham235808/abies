import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { errorMessage, enumLabel, formatDate, formatDateTime, formatRupees, personName } from '../../_lib/format';
import { OpportunityActions } from './opportunity-actions';

type OpportunityDetail = {
  id: string;
  title: string;
  service: string | null;
  expectedValue: number;
  probability: number;
  status: 'OPEN' | 'WON' | 'LOST';
  expectedCloseAt: string | null;
  wonAt: string | null;
  lostReason: string | null;
  lead: { id: string; firstName: string; lastName: string | null; stage: string } | null;
  owner: { id: string; name: string | null; mobile: string } | null;
  tasks: {
    id: string;
    title: string;
    type: string;
    priority: string;
    status: string;
    dueAt: string | null;
    completedAt: string | null;
  }[];
};

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');
  const { id } = await params;

  const res = await callDbService<{ opportunity: OpportunityDetail }>(
    `/db/v1/crm/opportunities/${encodeURIComponent(id)}`,
    { sessionToken: token },
  );
  if (res.status === 401) redirect('/ops/login');
  if (res.status === 404) notFound();
  if (res.status !== 200) {
    return (
      <div>
        <Link href="/ops/crm/opportunities" className="text-sm text-brand-purple-700 underline">
          Back to opportunities
        </Link>
        <Alert tone="error" className="mt-4">{errorMessage(res.body, 'Could not load this opportunity. Try again in a moment.')}</Alert>
      </div>
    );
  }
  const opp = res.body.opportunity;
  const weighted = Math.round((opp.expectedValue * opp.probability) / 100);

  return (
    <div>
      <Link href="/ops/crm/opportunities" className="text-sm text-brand-purple-700 underline">
        Back to opportunities
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-brand-neutral-900">{opp.title}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        {opp.status} · {formatRupees(opp.expectedValue)} at {opp.probability}%
        {opp.service ? ` · ${opp.service}` : ''}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-control border border-brand-neutral-100 bg-white p-5">
          <h2 className="text-base font-semibold text-brand-neutral-900">Details</h2>
          <dl className="mt-3 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-brand-neutral-500">Value</dt>
            <dd>{formatRupees(opp.expectedValue)}</dd>
            <dt className="text-brand-neutral-500">Weighted value</dt>
            <dd>{formatRupees(weighted)}</dd>
            <dt className="text-brand-neutral-500">Probability</dt>
            <dd>{opp.probability}%</dd>
            <dt className="text-brand-neutral-500">Expected close</dt>
            <dd>{formatDate(opp.expectedCloseAt)}</dd>
            <dt className="text-brand-neutral-500">Service</dt>
            <dd>{opp.service ?? '—'}</dd>
            <dt className="text-brand-neutral-500">Lead</dt>
            <dd>
              {opp.lead ? (
                <Link href={`/ops/crm/leads/${opp.lead.id}`} className="text-brand-purple-700 underline">
                  {personName(opp.lead)}
                </Link>
              ) : (
                'No lead linked'
              )}
            </dd>
            <dt className="text-brand-neutral-500">Owner</dt>
            <dd>{opp.owner ? opp.owner.name ?? opp.owner.mobile : 'Unassigned'}</dd>
            {opp.status === 'WON' && (
              <>
                <dt className="text-brand-neutral-500">Won on</dt>
                <dd>{formatDate(opp.wonAt)}</dd>
              </>
            )}
            {opp.status === 'LOST' && (
              <>
                <dt className="text-brand-neutral-500">Lost because</dt>
                <dd>{opp.lostReason ?? '—'}</dd>
              </>
            )}
          </dl>

          {opp.status === 'OPEN' && (
            <div className="mt-6 border-t border-brand-neutral-100 pt-5">
              <h3 className="mb-3 text-sm font-semibold text-brand-neutral-800">Close this opportunity</h3>
              <OpportunityActions opportunityId={opp.id} />
            </div>
          )}
        </section>

        <section className="rounded-control border border-brand-neutral-100 bg-white p-5">
          <h2 className="text-base font-semibold text-brand-neutral-900">Linked tasks</h2>
          <ul className="mt-3 divide-y divide-brand-neutral-100 text-sm">
            {opp.tasks.length === 0 && <li className="py-2 text-brand-neutral-500">No tasks linked to this opportunity yet.</li>}
            {opp.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-medium text-brand-neutral-900">{t.title}</div>
                  <div className="text-xs text-brand-neutral-500">
                    {enumLabel(t.type)} · {enumLabel(t.priority)} priority
                  </div>
                </div>
                <div className="text-right text-xs text-brand-neutral-600">
                  <div>{enumLabel(t.status)}</div>
                  <div>
                    {t.status === 'COMPLETED' ? `Done ${formatDateTime(t.completedAt)}` : t.dueAt ? `Due ${formatDateTime(t.dueAt)}` : 'No due time'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
