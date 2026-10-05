import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@abies/domain/server/current-user';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { canAssignLeads, canWriteLeads } from '@abies/domain/modules/crm/rbac';
import { getLead } from '@abies/domain/modules/crm/leads.service';
import { NotFoundError } from '@abies/domain/lib/errors';
import { LeadActions } from './lead-actions';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect('/ops/login');
  const actor = crmActorFromSession(session);
  const { id } = await params;

  let lead;
  try {
    lead = await getLead(id, actor);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

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
            <dd>{lead.lastContactedAt ? lead.lastContactedAt.toLocaleString('en-IN') : '—'}</dd>
          </dl>
          <LeadActions
            leadId={lead.id}
            stage={lead.stage}
            assignedToId={lead.assignedToId}
            canWrite={canWriteLeads(actor)}
            canAssign={canAssignLeads(actor)}
          />
        </section>

        <section className="rounded-control border border-brand-neutral-100 bg-white p-5">
          <h2 className="text-base font-semibold text-brand-neutral-900">Timeline</h2>
          <ol className="mt-3 space-y-3 text-sm">
            {lead.activities.length === 0 && <li className="text-brand-neutral-500">No activity yet.</li>}
            {lead.activities.map((a) => (
              <li key={a.id} className="border-l-2 border-brand-purple-200 pl-3">
                <div className="text-xs text-brand-neutral-500">
                  {a.createdAt.toLocaleString('en-IN')} · {a.type.replaceAll('_', ' ')}
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
