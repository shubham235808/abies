import { detail } from '@/modules/doctors/admin-doctors.service';
import { ReviewPanel } from './review-panel';

export default async function AdminDoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { doctor } = await detail(id);

  return (
    <ReviewPanel
      doctor={{
        id: doctor.id,
        slug: doctor.slug,
        title: doctor.title,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        bio: doctor.bio,
        registrationCouncil: doctor.registrationCouncil,
        registrationNumber: doctor.registrationNumber,
        primaryQualification: doctor.primaryQualification,
        highestQualification: doctor.highestQualification,
        yearsExperience: doctor.yearsExperience,
        specialties: doctor.specialties,
        languages: doctor.languages,
        consultationModes: doctor.consultationModes,
        verificationStatus: doctor.verificationStatus,
        rejectionReason: doctor.rejectionReason,
        user: { mobile: doctor.user.mobile, email: doctor.user.email },
        documents: doctor.documents.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          originalName: d.originalName,
          reviewNote: d.reviewNote,
        })),
        clinics: doctor.clinics.map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state })),
        availability: doctor.availability.map((a) => ({
          id: a.id,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
          mode: a.mode,
        })),
        verificationActions: doctor.verificationActions.map((a) => ({
          id: a.id,
          toStatus: a.toStatus,
          notes: a.notes,
          createdAt: a.createdAt.toISOString(),
        })),
      }}
    />
  );
}
