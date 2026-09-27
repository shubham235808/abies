import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { getLead, listLeadHistory } from '@/modules/partners/leads.service';
import { LeadActions } from './lead-actions';

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Lead created',
  CLAIMED: 'Lead claimed',
  UPDATED: 'Stage updated',
  DOCUMENT_UPLOADED: 'Document uploaded',
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let lead;
  try {
    lead = await getLead(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const history = await listLeadHistory(id);

  return (
    <div>
      <LeadActions
        lead={{
          id: lead.id,
          kind: lead.kind,
          contactName: lead.contactName,
          contactPhone: lead.contactPhone,
          contactEmail: lead.contactEmail,
          city: lead.city,
          source: lead.source,
          stage: lead.stage,
          notes: lead.notes,
          nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
          owner: lead.owner ? { mobile: lead.owner.mobile } : null,
          documentKeys: lead.documentKeys,
        }}
      />

      {history.length > 0 && (
        <div className="mt-6 max-w-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">History</h2>
          <ol className="mt-3 space-y-3 border-l border-brand-neutral-200 pl-4">
            {history.map((event) => {
              const stage = (event.metadata as { stage?: string } | null)?.stage;
              return (
                <li key={event.id} className="text-sm">
                  <p className="text-brand-neutral-900">
                    {ACTION_LABELS[event.action] ?? event.action}
                    {stage ? ` → ${stage}` : ''}
                  </p>
                  <p className="text-xs text-brand-neutral-400">
                    {event.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
