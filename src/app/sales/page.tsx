import Link from 'next/link';
import { PartnerLeadStageBadge } from '@/components/ui/badge';
import { listLeads } from '@/modules/partners/leads.service';
import { NewLeadForm } from './new-lead-form';

export default async function SalesLeadsPage() {
  const leads = await listLeads();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Partner leads</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Lead → Qualified → Verification → Commercial → Enablement → Activated pipeline for doctors, clinics, labs,
        pharmacies, Panchakarma centres and corporate accounts.
      </p>

      <NewLeadForm />

      {leads.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No leads yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {leads.map((l) => (
            <Link key={l.id} href={`/sales/${l.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-purple-300">
                <div>
                  <p className="font-medium text-brand-neutral-900">
                    {l.contactName} · {l.kind.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-1 text-sm text-brand-neutral-600">
                    {l.contactPhone} {l.city ? `· ${l.city}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-brand-neutral-400">
                    {l.owner ? `Owner: ${l.owner.mobile}` : 'Unowned'}
                    {l.nextFollowUpAt ? ` · Follow up ${new Date(l.nextFollowUpAt).toLocaleDateString('en-IN')}` : ''}
                  </p>
                </div>
                <PartnerLeadStageBadge stage={l.stage} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
