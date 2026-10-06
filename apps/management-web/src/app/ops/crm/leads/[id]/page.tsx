import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { LeadActions } from './lead-actions';

type LeadDetail = {
  id: string;
  customerUserId: string | null;
  firstName: string;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  preferredLanguage: string | null;
  source: string;
  campaign: string | null;
  interestedService: string | null;
  stage: string;
  priority: string;
  assignedToId: string | null;
  assignedTo: { name: string | null; mobile: string } | null;
  lastContactedAt: string | null;
  tags: { tag: { name: string } }[];
  activities: { id: string; type: string; summary: string; createdAt: string; actor: { name: string | null } | null }[];
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');
  const { id } = await params;

  const res = await callDbService<{ lead: LeadDetail; viewer: { canWrite: boolean; canAssign: boolean } }>(
    `/db/v1/crm/leads/${encodeURIComponent(id)}`,
    { sessionToken: token },
  );
  if (res.status === 401) redirect('/ops/login');
  if (res.status === 404) notFound();
  if (res.status !== 200) throw new Error('Could not load this lead');
  const { lead, viewer } = res.body;

  const name = `${lead.firstName} ${lead.lastName ?? ''}`.trim();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">{name}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        {lead.stage.replaceAll('_', ' ')} · {lead.source.replaceAll('_', ' ')} · Priority {lead.priority.toLowerCase()}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-control border border-brand-neutral-100 bg-white p-5">
          <h2 className="text-base font-semibold text-brand-neutral-900">Contact</h2>
          <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-brand-neutral-500">Mobile</dt>
            <dd>{lead.mobile ?? '—'}</dd>
            <dt className="text-brand-neutral-500">Email</dt>
            <dd>{lead.email ?? '—'}</dd>
            <dt className="text-brand-neutral-500">City</dt>
            <dd>{[lead.city, lead.state, lead.pinCode].filter(Boolean).join(', ') || '—'}</dd>
            <dt className="text-brand-neutral-500">Language</dt>
            <dd>{lead.preferredLanguage ?? '—'}</dd>
            <dt className="text-brand-neutral-500">Interested in</dt>
            <dd>{lead.interestedService ?? '—'}</dd>
            <dt className="text-brand-neutral-500">Campaign</dt>
            <dd>{lead.campaign ?? '—'}</dd>
            <dt className="text-brand-neutral-500">Owner</dt>
            <dd>{lead.assignedTo?.name ?? lead.assignedTo?.mobile ?? 'Unassigned'}</dd>
            <dt className="text-brand-neutral-500">Tags</dt>
            <dd>{lead.tags.map((t) => t.tag.name).join(', ') || '—'}</dd>
            <dt className="text-brand-neutral-500">Last contacted</dt>
            <dd>{lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleString('en-IN') : '—'}</dd>
          </dl>
          <LeadActions
            leadId={lead.id}
            stage={lead.stage}
            assignedToId={lead.assignedToId}
            canWrite={viewer.canWrite}
            canAssign={viewer.canAssign}
          />
          {lead.customerUserId && (
            <Link
              href={`/ops/crm/customers/${encodeURIComponent(lead.customerUserId)}`}
              className="mt-4 inline-block text-sm font-medium text-brand-purple-700 hover:underline"
            >
              View customer summary
            </Link>
          )}
        </section>

        <section className="rounded-control border border-brand-neutral-100 bg-white p-5">
          <h2 className="text-base font-semibold text-brand-neutral-900">Timeline</h2>
          <ol className="mt-3 space-y-3 text-sm">
            {lead.activities.length === 0 && <li className="text-brand-neutral-500">No activity yet.</li>}
            {lead.activities.map((a) => (
              <li key={a.id} className="border-l-2 border-brand-purple-200 pl-3">
                <div className="text-xs text-brand-neutral-500">
                  {new Date(a.createdAt).toLocaleString('en-IN')} · {a.type.replaceAll('_', ' ')}
                  {a.actor?.name ? ` · ${a.actor.name}` : ''}
                </div>
                <div className="text-brand-neutral-800">{a.summary}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
