import { EarningsHistory } from '@/components/settlement/earnings-history';
import { earningsSummary, listMyCommissions, listMyPayouts } from '@/modules/settlement/earnings.service';
import { getMe } from '@/modules/doctors/doctors.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function DoctorEarningsPage() {
  const session = await requireSessionOrRedirect();
  const { profile } = await getMe(session.userId);

  const [summary, commissions, payouts] = await Promise.all([
    earningsSummary('DOCTOR', profile.id),
    listMyCommissions('DOCTOR', profile.id),
    listMyPayouts('DOCTOR', profile.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Earnings</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Your commission on every completed consultation, and the payouts they&apos;ve been settled into.</p>
      <div className="mt-6">
        <EarningsHistory summary={summary} commissions={commissions} payouts={payouts} />
      </div>
    </div>
  );
}
