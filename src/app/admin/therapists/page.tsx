import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { queue } from '@/modules/panchakarma/admin-therapists.service';

// ENTERPRISE-8 — standalone for now; docs/ENTERPRISE-IMPLEMENTATION-PLAN.md's
// ENTERPRISE-13 folds this into the consolidated Verification Centre as a
// fifth tab alongside doctors/labs/pharmacies/panchakarma-centres.
export default async function AdminTherapistsQueuePage() {
  const { therapists, total } = await queue();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Therapist document verification</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">{total} therapist(s) with a document awaiting review</p>

      <div className="mt-6 space-y-3">
        {therapists.map((t) => {
          const pending = t.documents.filter((d) => d.status !== 'VERIFIED').length;
          return (
            <Link key={t.id} href={`/admin/therapists/${t.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{t.name}</p>
                    <p className="text-sm text-brand-neutral-500">{t.centre.name ?? 'Unnamed centre'}</p>
                  </div>
                  <span className="text-xs text-brand-orange-600">{pending} document(s) need review</span>
                </div>
              </Card>
            </Link>
          );
        })}
        {therapists.length === 0 && <p className="text-sm text-brand-neutral-500">Nothing needs review right now.</p>}
      </div>
    </div>
  );
}
