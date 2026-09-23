import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export interface PublicDoctorSummary {
  slug: string;
  name: string;
  primaryQualification: string | null;
  highestQualification: string | null;
  yearsExperience: number | null;
  specialties: string[];
  languages: string[];
  consultationModes: string[];
  startingFee: number | null;
  rating: number;
  reviewCount: number;
  clinics: { city: string }[];
}

export function DoctorCard({ doctor }: { doctor: PublicDoctorSummary }) {
  const city = doctor.clinics[0]?.city;
  return (
    <Link
      href={`/doctors/${doctor.slug}`}
      className="block rounded-card border border-brand-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-brand-neutral-900">{doctor.name}</p>
          <p className="text-sm text-brand-neutral-500">
            {doctor.highestQualification || doctor.primaryQualification}
            {doctor.yearsExperience ? ` · ${doctor.yearsExperience} yrs experience` : ''}
          </p>
        </div>
        <Badge tone="success">Verified</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {doctor.specialties.slice(0, 3).map((s) => (
          <Badge key={s} tone="purple">
            {s}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brand-neutral-500">
        {city && <span>{city}</span>}
        {doctor.languages.length > 0 && <span>{doctor.languages.join(', ')}</span>}
        <span>{doctor.consultationModes.join(' · ')}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-brand-neutral-600">
          {doctor.startingFee ? `From ₹${doctor.startingFee}` : 'Fee on request'}
        </span>
        {doctor.reviewCount > 0 && (
          <span className="text-sm text-brand-neutral-500">
            ★ {doctor.rating.toFixed(1)} ({doctor.reviewCount})
          </span>
        )}
      </div>
    </Link>
  );
}
