import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DoctorAvatar } from '@/components/ui/doctor-avatar';
import { RatingBadge } from '@/components/ui/rating';
import { NotFoundError } from '@/lib/errors';
import { publicProfile } from '@/modules/doctors/doctors.service';
import { listForDoctorBySlug } from '@/modules/reviews/reviews.service';
import { getCurrentSession } from '@/server/current-user';
import { BookingWidget } from './booking-widget';

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
  const session = await getCurrentSession();
  const reviews = await listForDoctorBySlug(slug);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <DoctorAvatar photoUrl={doctor.photoUrl} name={doctor.name} size={64} />
          <div>
            <h1 className="text-3xl font-semibold text-brand-neutral-900">{doctor.name}</h1>
            <p className="mt-1 text-brand-neutral-600">
              {doctor.highestQualification || doctor.primaryQualification}
              {doctor.yearsExperience ? ` · ${doctor.yearsExperience} years experience` : ''}
            </p>
            <div className="mt-1">
              <RatingBadge rating={doctor.rating} reviewCount={doctor.reviewCount} />
            </div>
          </div>
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

      {reviews.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-brand-neutral-900">Patient reviews</h2>
          <div className="mt-3 space-y-3">
            {reviews.map((r) => {
              const firstName = r.author.patientProfile?.firstName;
              const lastInitial = r.author.patientProfile?.lastName?.[0];
              const authorLabel = firstName ? `${firstName}${lastInitial ? ` ${lastInitial}.` : ''}` : 'A patient';
              return (
                <Card key={r.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-brand-neutral-900">{authorLabel}</span>
                    <span className="text-sm text-brand-purple-600" aria-label={`${r.rating} out of 5 stars`}>
                      {'★'.repeat(r.rating)}
                      {'☆'.repeat(5 - r.rating)}
                    </span>
                  </div>
                  {r.comment && <p className="mt-2 text-sm text-brand-neutral-600">{r.comment}</p>}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <BookingWidget
        doctorProfileId={doctor.id}
        doctorName={doctor.name}
        modes={doctor.consultationModes}
        videoFee={doctor.videoFee}
        clinicFee={doctor.clinicFee}
        viewerRole={session?.user.role ?? null}
      />
    </main>
  );
}
