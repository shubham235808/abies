import { EarningsHistory } from '@/components/settlement/earnings-history';
import { earningsSummary, listMyCommissions, listMyPayouts } from '@abies/domain/modules/settlement/earnings.service';
import { getMyCentre } from '@abies/domain/modules/panchakarma/centres.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

export default async function PanchakarmaCentreEarningsPage() {
  const session = await requireSessionOrRedirect();
  const { centre } = await getMyCentre(session.userId);

  const [summary, commissions, payouts] = await Promise.all([
    earningsSummary('PANCHAKARMA_CENTRE', centre.id),
    listMyCommissions('PANCHAKARMA_CENTRE', centre.id),
    listMyPayouts('PANCHAKARMA_CENTRE', centre.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Earnings</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Your commission on every completed course, and the payouts they&apos;ve been settled into.</p>
      <div className="mt-6">
        <EarningsHistory summary={summary} commissions={commissions} payouts={payouts} />
      </div>
    </div>
  );
}
