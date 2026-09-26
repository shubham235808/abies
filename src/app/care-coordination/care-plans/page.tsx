import { listAtRiskItems } from '@/modules/care-plans/care-plans.service';
import { CarePlanItemStatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default async function CareCoordinationCarePlansPage() {
  const items = await listAtRiskItems();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Care plan follow-ups</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Plan items that are overdue, due within two days, or already missed, across every active care plan — help the
        patient complete these, or open a support ticket if something needs escalating.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">Nothing at risk right now.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((item) => {
            const patientName =
              [item.carePlan.patientUser.patientProfile?.firstName, item.carePlan.patientUser.patientProfile?.lastName]
                .filter(Boolean)
                .join(' ') || item.carePlan.patientUser.mobile;
            const doctorName = [item.carePlan.doctorProfile.firstName, item.carePlan.doctorProfile.lastName].filter(Boolean).join(' ');
            return (
              <Card key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{item.title}</p>
                    <p className="mt-1 text-sm text-brand-neutral-600">
                      {patientName} · Dr. {doctorName}
                    </p>
                    <p className="mt-1 text-xs text-brand-neutral-400">
                      Due {item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'unspecified'}
                    </p>
                  </div>
                  <CarePlanItemStatusBadge status={item.status} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
