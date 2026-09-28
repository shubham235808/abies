import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { getLead, listLeadHistory } from '@/modules/partners/leads.service';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Timeline } from '@/components/ui/timeline';
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
      <Breadcrumb items={[{ label: 'Partner leads', href: '/sales' }, { label: lead.contactName }]} />
      <div className="mt-3">
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
      </div>

      {history.length > 0 && (
        <div className="mt-6 max-w-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">History</h2>
          <div className="mt-3">
            <Timeline
              entries={history.map((event) => {
                const stage = (event.metadata as { stage?: string } | null)?.stage;
                return {
                  id: event.id,
                  label: `${ACTION_LABELS[event.action] ?? event.action}${stage ? ` → ${stage}` : ''}`,
                  timestamp: event.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
                };
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
