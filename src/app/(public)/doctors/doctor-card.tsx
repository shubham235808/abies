import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DoctorAvatar } from '@/components/ui/doctor-avatar';
import { HoverCard } from '@/components/ui/card';
import { RatingBadge } from '@/components/ui/rating';

export interface PublicDoctorSummary {
  slug: string;
  name: string;
  photoUrl: string | null;
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
  languageMatch?: boolean;
}

export function DoctorCard({ doctor }: { doctor: PublicDoctorSummary }) {
  const city = doctor.clinics[0]?.city;
  return (
    <Link href={`/doctors/${doctor.slug}`} className="block">
      <HoverCard className="overflow-hidden">
        <div className="flex gap-4 p-5">
          <DoctorAvatar photoUrl={doctor.photoUrl} name={doctor.name} size={74} />
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-brand-neutral-900">{doctor.name}</p>
              <Badge tone="success">Verified</Badge>
            </div>
            <p className="text-xs text-brand-neutral-500">
              {doctor.highestQualification || doctor.primaryQualification}
              {doctor.yearsExperience ? ` · ${doctor.yearsExperience} yrs experience` : ''}
            </p>
            <div className="mt-1">
              <RatingBadge rating={doctor.rating} reviewCount={doctor.reviewCount} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {doctor.languageMatch && <Badge tone="blue">Speaks your language</Badge>}
              {doctor.specialties.slice(0, 2).map((s) => (
                <Badge key={s} tone="purple">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-brand-neutral-100 bg-brand-neutral-50/60 px-5 py-3.5">
          <div>
            <strong className="block text-brand-neutral-900">
              {doctor.startingFee ? `₹${doctor.startingFee}` : 'Fee on request'}
            </strong>
            <span className="text-xs text-brand-neutral-500">
              {[city, doctor.consultationModes.join(' · ')].filter(Boolean).join(' · ')}
            </span>
          </div>
          <span className="shrink-0 rounded-control bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 px-3.5 py-2 text-sm font-bold text-white">
            View & book
          </span>
        </div>
      </HoverCard>
    </Link>
  );
}
