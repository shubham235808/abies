import { EarningsHistory } from '@/components/settlement/earnings-history';
import { earningsSummary, listMyCommissions, listMyPayouts } from '@/modules/settlement/earnings.service';
import { getMyLab } from '@/modules/diagnostics/labs.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function LabEarningsPage() {
  const session = await requireSessionOrRedirect();
  const { lab } = await getMyLab(session.userId);

  const [summary, commissions, payouts] = await Promise.all([
    earningsSummary('DIAGNOSTIC_LAB', lab.id),
    listMyCommissions('DIAGNOSTIC_LAB', lab.id),
    listMyPayouts('DIAGNOSTIC_LAB', lab.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Earnings</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Your commission on every released report, and the payouts they&apos;ve been settled into.</p>
      <div className="mt-6">
        <EarningsHistory summary={summary} commissions={commissions} payouts={payouts} />
      </div>
    </div>
  );
}
