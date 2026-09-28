import Link from 'next/link';
import { listLeads } from '@/modules/partners/leads.service';
import { NewLeadForm } from './new-lead-form';
import type { PartnerLeadStage } from '@prisma/client';

const COLUMNS: { stage: PartnerLeadStage; label: string }[] = [
  { stage: 'NEW', label: 'New' },
  { stage: 'CONTACTED', label: 'Contacted' },
  { stage: 'QUALIFIED', label: 'Qualified' },
  { stage: 'DOCUMENTATION', label: 'Documentation' },
  { stage: 'VERIFICATION', label: 'Verification' },
  { stage: 'COMMERCIAL', label: 'Commercial' },
  { stage: 'ENABLEMENT', label: 'Enablement' },
  { stage: 'ACTIVATED', label: 'Activated' },
  { stage: 'REJECTED', label: 'Rejected' },
];

export default async function SalesLeadsPage() {
  const leads = await listLeads();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Partner leads</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        New → Contacted → Qualified → Documentation → Verification → Commercial → Enablement → Activated pipeline
        for doctors, clinics, labs, pharmacies, Panchakarma centres and corporate accounts.
      </p>

      <NewLeadForm />

      {leads.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No leads yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {COLUMNS.map((col) => {
              const columnLeads = leads.filter((l) => l.stage === col.stage);
              return (
                <div key={col.stage} className="w-72 flex-shrink-0">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-semibold text-brand-neutral-700">{col.label}</h2>
                    <span className="text-xs text-brand-neutral-400">{columnLeads.length}</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {columnLeads.length === 0 ? (
                      <p className="rounded-card border border-dashed border-brand-neutral-200 p-3 text-xs text-brand-neutral-400">
                        No leads in this stage.
                      </p>
                    ) : (
                      columnLeads.map((l) => (
                        <Link key={l.id} href={`/sales/${l.id}`}>
                          <div className="rounded-card border border-brand-neutral-200 bg-white p-3 shadow-sm transition-colors hover:border-brand-purple-300">
                            <p className="font-medium text-brand-neutral-900">{l.contactName}</p>
                            <p className="mt-1 text-xs text-brand-neutral-600">
                              {l.kind.replace(/_/g, ' ')} {l.city ? `· ${l.city}` : ''}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-brand-neutral-400">{l.owner ? l.owner.mobile : 'Unowned'}</span>
                              {l.nextFollowUpAt && (
                                <span className="text-xs text-brand-orange-600">
                                  {new Date(l.nextFollowUpAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
