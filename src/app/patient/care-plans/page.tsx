import Link from 'next/link';
import { CarePlanStatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listMineAsPatient } from '@/modules/care-plans/care-plans.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function PatientCarePlansPage() {
  const session = await requireSessionOrRedirect();
  const plans = await listMineAsPatient(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Care plans</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Treatment plans your doctors have set up for you and your family.
      </p>

      {plans.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No care plans yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {plans.map((plan) => {
            const doctorName = [plan.doctorProfile.title, plan.doctorProfile.firstName, plan.doctorProfile.lastName]
              .filter(Boolean)
              .join(' ');
            const completedCount = plan.items.filter((i) => i.status === 'COMPLETED').length;
            return (
              <Link key={plan.id} href={`/patient/care-plans/${plan.id}`}>
                <Card className="transition-colors hover:border-brand-purple-300">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-brand-neutral-900">
                        {doctorName}
                        {plan.careRecipientFamilyMember && ` — for ${plan.careRecipientFamilyMember.name}`}
                      </p>
                      {plan.summary && <p className="mt-1 text-sm text-brand-neutral-600">{plan.summary}</p>}
                      <p className="mt-1 text-xs text-brand-neutral-400">
                        {plan.items.length} item{plan.items.length === 1 ? '' : 's'} · {completedCount} completed
                      </p>
                    </div>
                    <CarePlanStatusBadge status={plan.status} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
