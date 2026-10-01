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

// What a consultation here actually includes — real, already-built
// platform capabilities (prescriptions, diagnostic/Panchakarma
// recommendations, follow-ups all exist as real features elsewhere in
// this app), not a claim specific to this one doctor.
const WHAT_TO_EXPECT = [
  'Digital consultation summary',
  'Secure prescription and care tasks',
  'Report review where required',
  'Medicine fulfilment through verified partners',
  'Panchakarma referral where appropriate',
  'Follow-up reminders and outcome tracking',
];

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
    <main>
      <div className="bg-gradient-to-b from-[#fff7fd] to-white">
        <div className="mx-auto max-w-5xl px-6 pb-10 pt-[54px]">
          <span className="text-sm font-bold text-brand-purple-700">Doctors / {doctor.name}</span>
          <h1 className="mt-2.5 text-[clamp(36px,4vw,52px)] font-extrabold tracking-tight text-brand-neutral-900">{doctor.name}</h1>
          <p className="mt-1 max-w-xl text-brand-neutral-500">
            {doctor.highestQualification || doctor.primaryQualification}
            {doctor.yearsExperience ? ` · ${doctor.yearsExperience} years experience` : ''} · {doctor.specialties.join(', ')}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.75fr]">
          <div className="rounded-card border border-brand-neutral-200 bg-white p-6">
            <div className="flex items-start gap-5">
              <DoctorAvatar photoUrl={doctor.photoUrl} name={doctor.name} size={110} />
              <div>
                <h2 className="text-2xl font-bold text-brand-neutral-900">{doctor.name}</h2>
                <p className="mt-1 text-sm text-brand-neutral-500">
                  {doctor.highestQualification || doctor.primaryQualification}
                  <br />
                  {doctor.yearsExperience ? `${doctor.yearsExperience} years experience` : ''}
                  {doctor.languages.length > 0 ? ` · ${doctor.languages.join(', ')}` : ''}
                </p>
                <div className="mt-1">
                  <RatingBadge rating={doctor.rating} reviewCount={doctor.reviewCount} />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Badge tone="success">Verified practitioner</Badge>
                  {doctor.specialties.map((s: string) => (
                    <Badge key={s} tone="purple">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <hr className="my-5 border-brand-neutral-100" />

            {doctor.bio && (
              <>
                <h3 className="font-bold text-brand-neutral-900">About the consultation</h3>
                <p className="mt-2 text-sm text-brand-neutral-500">{doctor.bio}</p>
                <hr className="my-5 border-brand-neutral-100" />
              </>
            )}

            <h3 className="font-bold text-brand-neutral-900">What you can expect</h3>
            <div className="mt-3 grid gap-2.5">
              {WHAT_TO_EXPECT.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-control bg-semantic-success-50 text-xs text-semantic-success-700">
                    ✓
                  </span>
                  <span className="text-sm text-brand-neutral-700">{item}</span>
                </div>
              ))}
            </div>

            <hr className="my-5 border-brand-neutral-100" />
            <h3 className="font-bold text-brand-neutral-900">Registration</h3>
            <p className="mt-2 text-sm text-brand-neutral-500">
              {doctor.registrationCouncil}
              <br />
              {doctor.registrationNumber}
            </p>

            {doctor.clinics.length > 0 && (
              <>
                <hr className="my-5 border-brand-neutral-100" />
                <h3 className="font-bold text-brand-neutral-900">Clinics</h3>
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
              </>
            )}

            {doctor.availability.length > 0 && (
              <>
                <hr className="my-5 border-brand-neutral-100" />
                <h3 className="font-bold text-brand-neutral-900">Weekly availability</h3>
                <ul className="mt-3 space-y-1 text-sm text-brand-neutral-600">
                  {doctor.availability.map((a: { id: string; dayOfWeek: number; startTime: string; endTime: string; mode: string }) => (
                    <li key={a.id}>
                      {DAYS[a.dayOfWeek]}, {a.startTime}–{a.endTime} ({a.mode})
                    </li>
                  ))}
                </ul>
              </>
            )}

            {reviews.length > 0 && (
              <>
                <hr className="my-5 border-brand-neutral-100" />
                <h3 className="font-bold text-brand-neutral-900">Patient reviews</h3>
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
              </>
            )}
          </div>

          <aside className="h-max lg:sticky lg:top-[100px]">
            <BookingWidget
              doctorProfileId={doctor.id}
              doctorName={doctor.name}
              modes={doctor.consultationModes}
              videoFee={doctor.videoFee}
              clinicFee={doctor.clinicFee}
              viewerRole={session?.user.role ?? null}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
