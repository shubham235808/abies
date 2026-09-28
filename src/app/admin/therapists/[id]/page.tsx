import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { detail } from '@/modules/panchakarma/admin-therapists.service';
import { TherapistReviewPanel } from './review-panel';

export default async function AdminTherapistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let therapist;
  try {
    therapist = await detail(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <TherapistReviewPanel
      therapistId={therapist.id}
      name={therapist.name}
      centreName={therapist.centre.name}
      documents={therapist.documents.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        originalName: d.originalName,
        reviewNote: d.reviewNote,
      }))}
    />
  );
}
