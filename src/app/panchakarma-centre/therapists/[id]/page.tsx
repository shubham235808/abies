import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { listTherapistDocuments } from '@/modules/panchakarma/catalogue.service';
import { prisma } from '@/lib/db';
import { requireSessionOrRedirect } from '@/server/current-user';
import { TherapistDocumentsManager } from './documents-manager';

export default async function TherapistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const therapist = await prisma.therapist.findFirst({
    where: { id, centre: { userId: session.userId } },
  });
  if (!therapist) notFound();

  let documents;
  try {
    documents = await listTherapistDocuments(session.userId, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-brand-neutral-900">{therapist.name}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        {therapist.qualifications || 'No qualifications on file'}
        {therapist.languages.length > 0 ? ` · ${therapist.languages.join(', ')}` : ''}
      </p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Documents</h2>
      <p className="mt-1 text-xs text-brand-neutral-500">
        ABIES reviews and verifies each document — the centre can upload and remove, but only an administrator can
        verify or reject one.
      </p>
      <div className="mt-3">
        <TherapistDocumentsManager
          therapistId={id}
          initial={documents.map((d) => ({
            id: d.id,
            type: d.type,
            status: d.status,
            originalName: d.originalName,
            createdAt: d.createdAt.toISOString(),
            reviewNote: d.reviewNote,
          }))}
        />
      </div>
    </div>
  );
}
