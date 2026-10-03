import Link from 'next/link';
import { Badge, CarePlanStatusBadge } from '@abies/design-system/components/ui/badge';
import { Card } from '@abies/design-system/components/ui/card';
import { listMineAsDoctor } from '@abies/domain/modules/care-plans/care-plans.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

export default async function DoctorCarePlansPage() {
  const session = await requireSessionOrRedirect();
  const plans = await listMineAsDoctor(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Care plans</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Treatment plans you&apos;ve created. Start one from a patient&apos;s consultation.
      </p>

      {plans.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No care plans yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {plans.map((plan) => {
            const patientName =
              [plan.patientUser.patientProfile?.firstName, plan.patientUser.patientProfile?.lastName]
                .filter(Boolean)
                .join(' ') || plan.patientUser.mobile;
            const completedCount = plan.items.filter((i) => i.status === 'COMPLETED').length;
            return (
              <Link key={plan.id} href={`/partner/doctor/care-plans/${plan.id}`}>
                <Card className="transition-colors hover:border-brand-purple-300">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-brand-neutral-900">
                        {patientName}
                        {plan.careRecipientFamilyMember && ` (for ${plan.careRecipientFamilyMember.name})`}
                      </p>
                      {plan.summary && <p className="mt-1 text-sm text-brand-neutral-600">{plan.summary}</p>}
                      <p className="mt-1 text-xs text-brand-neutral-400">
                        {plan.items.length} item{plan.items.length === 1 ? '' : 's'} · {completedCount} completed
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <CarePlanStatusBadge status={plan.status} />
                      {plan.status === 'DRAFT' && <Badge tone="neutral">Not yet shared with patient</Badge>}
                    </div>
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
