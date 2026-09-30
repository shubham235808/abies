import { facets, searchPublic } from '@/modules/medicines/catalogue.service';
import { publicMedicineSearchSchema } from '@/modules/medicines/catalogue.schemas';
import { getCurrentSession } from '@/server/current-user';
import { MedicinesFilters } from './filters';
import { MedicineCard } from './medicine-card';

export const metadata = { title: 'Medicines — ABIES' };
// Live search results — must render per-request, never prerendered at
// build time (the build stage has no DB to query).
export const dynamic = 'force-dynamic';

export default async function MedicinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [{ medicines, total }, facetData, session] = await Promise.all([
    searchPublic(publicMedicineSearchSchema.parse(params)),
    facets(),
    getCurrentSession(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-blue-600">Medicines</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900">Order over-the-counter medicines</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Every medicine below is stocked by a pharmacy reviewed and approved by ABIES. If your doctor has written
        you a prescription, order it directly from your patient dashboard under Medicines instead.
      </p>

      <div className="mt-6">
        <MedicinesFilters facets={facetData} />
      </div>

      <p className="mt-6 text-sm text-brand-neutral-500">{total} medicine(s) found</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {medicines.map((m) => (
          <MedicineCard key={`${m.pharmacy.id}:${m.medicineId}`} medicine={m} viewerRole={session?.user.role ?? null} />
        ))}
      </div>
      {medicines.length === 0 && (
        <p className="mt-10 text-center text-sm text-brand-neutral-500">
          No medicines match those filters yet. Try broadening your search.
        </p>
      )}
    </main>
  );
}
