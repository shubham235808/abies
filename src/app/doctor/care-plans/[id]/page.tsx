import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { getCarePlan } from '@/modules/care-plans/care-plans.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { CarePlanWorkspace } from './workspace';

export default async function DoctorCarePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  let plan;
  try {
    plan = await getCarePlan(session.userId, session.user.role, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const patientName =
    [plan.patientUser.patientProfile?.firstName, plan.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
    plan.patientUser.mobile;

  return (
    <CarePlanWorkspace
      plan={{
        id: plan.id,
        status: plan.status,
        startDate: plan.startDate.toISOString().slice(0, 10),
        targetDate: plan.targetDate?.toISOString().slice(0, 10) ?? null,
        summary: plan.summary,
        goals: plan.goals,
        patientName,
        careRecipientName: plan.careRecipientFamilyMember?.name ?? null,
        items: plan.items.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          description: item.description,
          status: item.status,
          dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
          completedDate: item.completedDate?.toISOString() ?? null,
          patientMarkedDoneAt: item.patientMarkedDoneAt?.toISOString() ?? null,
          notes: item.notes,
        })),
      }}
    />
  );
}
