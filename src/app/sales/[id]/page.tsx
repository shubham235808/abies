import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { getLead } from '@/modules/partners/leads.service';
import { LeadActions } from './lead-actions';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let lead;
  try {
    lead = await getLead(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
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
  );
}
