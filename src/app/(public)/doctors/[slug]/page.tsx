import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { NotFoundError } from '@/lib/errors';
import { publicProfile } from '@/modules/doctors/doctors.service';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Live profile data (and the trust rule's isDiscoverable check) — must
// render per-request, never prerendered at build time (the build stage
// has no DB to query, and a newly approved doctor shouldn't need a rebuild
// to appear).
export const dynamic = 'force-dynamic';

export default async function DoctorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let doctor;
  try {
    ({ doctor } = await publicProfile(slug));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-brand-neutral-900">{doctor.name}</h1>
          <p className="mt-1 text-brand-neutral-600">
            {doctor.highestQualification || doctor.primaryQualification}
            {doctor.yearsExperience ? ` · ${doctor.yearsExperience} years experience` : ''}
          </p>
        </div>
        <Badge tone="success">Verified practitioner</Badge>
      </div>

      {doctor.bio && <p className="mt-6 max-w-2xl text-brand-neutral-700">{doctor.bio}</p>}

      <div className="mt-6 flex flex-wrap gap-1.5">
        {doctor.specialties.map((s: string) => (
          <Badge key={s} tone="purple">
            {s}
          </Badge>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-brand-neutral-900">Consultation</h2>
          <dl className="mt-2 space-y-1 text-sm text-brand-neutral-600">
            <div>Languages: {doctor.languages.join(', ') || '—'}</div>
            <div>Modes: {doctor.consultationModes.join(', ') || '—'}</div>
            {doctor.videoFee != null && <div>Video fee: ₹{doctor.videoFee}</div>}
            {doctor.clinicFee != null && <div>Clinic fee: ₹{doctor.clinicFee}</div>}
          </dl>
        </Card>
        <Card>
          <h2 className="font-semibold text-brand-neutral-900">Registration</h2>
          <dl className="mt-2 space-y-1 text-sm text-brand-neutral-600">
            <div>{doctor.registrationCouncil}</div>
            <div>{doctor.registrationNumber}</div>
          </dl>
        </Card>
      </div>

      {doctor.clinics.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-brand-neutral-900">Clinics</h2>
          <div className="mt-3 space-y-3">
            {doctor.clinics.map((c: { id: string; name: string; addressLine1: string; city: string; state: string }) => (
              <Card key={c.id}>
                <p className="font-medium text-brand-neutral-900">{c.name}</p>
                <p className="text-sm text-brand-neutral-500">
                  {c.addressLine1}, {c.city}, {c.state}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {doctor.availability.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-brand-neutral-900">Weekly availability</h2>
          <ul className="mt-3 space-y-1 text-sm text-brand-neutral-600">
            {doctor.availability.map((a: { id: string; dayOfWeek: number; startTime: string; endTime: string; mode: string }) => (
              <li key={a.id}>
                {DAYS[a.dayOfWeek]}, {a.startTime}–{a.endTime} ({a.mode})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 rounded-card border border-brand-neutral-200 bg-brand-neutral-50 px-4 py-3 text-sm text-brand-neutral-600">
        Appointment booking — Coming soon.
      </div>
    </main>
  );
}
