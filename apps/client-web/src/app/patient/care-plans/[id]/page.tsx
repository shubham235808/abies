import { notFound } from 'next/navigation';
import { Card } from '@abies/design-system/components/ui/card';
import { CarePlanStatusBadge } from '@abies/design-system/components/ui/badge';
import { NotFoundError } from '@abies/domain/lib/errors';
import { getCarePlan } from '@abies/domain/modules/care-plans/care-plans.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { ItemList } from './item-list';

export default async function PatientCarePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  let plan;
  try {
    plan = await getCarePlan(session.userId, session.user.role, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const doctorName = [plan.doctorProfile.title, plan.doctorProfile.firstName, plan.doctorProfile.lastName].filter(Boolean).join(' ');

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">
            Care plan — {doctorName}
            {plan.careRecipientFamilyMember && ` (for ${plan.careRecipientFamilyMember.name})`}
          </h1>
          <p className="mt-1 text-sm text-brand-neutral-600">
            Started {plan.startDate.toLocaleDateString()}
            {plan.targetDate && ` · Target ${plan.targetDate.toLocaleDateString()}`}
          </p>
        </div>
        <CarePlanStatusBadge status={plan.status} />
      </div>

      {(plan.summary || plan.goals.length > 0) && (
        <Card className="mt-6">
          {plan.summary && <p className="text-sm text-brand-neutral-700">{plan.summary}</p>}
          {plan.goals.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-brand-neutral-700">
              {plan.goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Items</h2>
        <p className="mt-1 text-xs text-brand-neutral-500">
          Status is set by your doctor. You can mark a task as done on your end — that&apos;s a separate note for
          your doctor, not a change to their clinical record.
        </p>
        <ItemList
          items={plan.items.map((item) => ({
            id: item.id,
            type: item.type,
            title: item.title,
            description: item.description,
            status: item.status,
            dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
            patientMarkedDoneAt: item.patientMarkedDoneAt?.toISOString() ?? null,
          }))}
        />
      </Card>
    </div>
  );
}
