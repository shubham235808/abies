import { facets, searchPublic } from '@abies/domain/modules/doctors/doctors.service';
import { prisma } from '@abies/domain/lib/db';
import { getCurrentSession } from '@abies/domain/server/current-user';
import { DoctorCard } from './doctor-card';
import { DoctorFilters } from './filters';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('doctors');
}
// Live search results — must render per-request, never prerendered at
// build time (the build stage has no DB to query).
export const dynamic = 'force-dynamic';

async function currentPatientLanguages(): Promise<string[] | undefined> {
  const session = await getCurrentSession();
  if (!session || session.user.role !== 'PATIENT') return undefined;
  const profile = await prisma.patientProfile.findUnique({
    where: { userId: session.userId },
    select: { preferredLanguage: true, additionalLanguages: true },
  });
  if (!profile) return undefined;
  return [profile.preferredLanguage, ...profile.additionalLanguages].filter(Boolean);
}

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [{ doctors, total }, facetData] = await Promise.all([
    searchPublic({
      q: params.q,
      city: params.city,
      specialty: params.specialty,
      language: params.language,
      mode: params.mode === 'VIDEO' || params.mode === 'CLINIC' ? params.mode : undefined,
      patientLanguages: await currentPatientLanguages(),
    }),
    facets(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-semibold text-brand-neutral-900">Find a verified Ayurveda doctor</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        Every practitioner listed here has been reviewed against their registration council and
        qualification documents.
      </p>

      <div className="mt-6">
        <DoctorFilters facets={facetData} />
      </div>

      <p className="mt-6 text-sm text-brand-neutral-500">{total} doctor(s) found</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map((d) => (
          <DoctorCard key={d.slug} doctor={d} />
        ))}
      </div>
      {doctors.length === 0 && (
        <p className="mt-10 text-center text-sm text-brand-neutral-500">
          No doctors match those filters yet. Try broadening your search.
        </p>
      )}
    </main>
  );
}
