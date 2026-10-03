import { EarningsHistory } from '@/components/settlement/earnings-history';
import { earningsSummary, listMyCommissions, listMyPayouts } from '@abies/domain/modules/settlement/earnings.service';
import { getMyPharmacy } from '@abies/domain/modules/medicines/pharmacies.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

export default async function PharmacyEarningsPage() {
  const session = await requireSessionOrRedirect();
  const { pharmacy } = await getMyPharmacy(session.userId);

  const [summary, commissions, payouts] = await Promise.all([
    earningsSummary('PHARMACY', pharmacy.id),
    listMyCommissions('PHARMACY', pharmacy.id),
    listMyPayouts('PHARMACY', pharmacy.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Earnings</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Your commission on every delivered order, and the payouts they&apos;ve been settled into.</p>
      <div className="mt-6">
        <EarningsHistory summary={summary} commissions={commissions} payouts={payouts} />
      </div>
    </div>
  );
}
