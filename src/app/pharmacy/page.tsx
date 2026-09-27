import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { VerificationBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { ListRow } from '@/components/ui/list-row';
import { getMyPharmacy } from '@/modules/medicines/pharmacies.service';
import { listMyInventory } from '@/modules/medicines/catalogue.service';
import { listMineAsPharmacy } from '@/modules/medicines/orders.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

const LOW_STOCK_THRESHOLD = 10;
const EXPIRING_WITHIN_DAYS = 30;

function patientName(order: { patientUser: { mobile: string; patientProfile: { firstName: string | null; lastName: string | null } | null } }) {
  return [order.patientUser.patientProfile?.firstName, order.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') || order.patientUser.mobile;
}

export default async function PharmacyOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { pharmacy } = await getMyPharmacy(session.userId);
  const inventory = await listMyInventory(session.userId);
  const editable = pharmacy.verificationStatus === 'DRAFT' || pharmacy.verificationStatus === 'REJECTED';
  const approved = pharmacy.verificationStatus === 'APPROVED';

  const orders = approved ? await listMineAsPharmacy(session.userId) : [];

  // docs/PORTAL-UX-SPEC.md's Pharmacy dashboard — every bucket derived from
  // MedicineOrderStatus and PharmacyInventory.expiryDate, no new query.
  const newOrders = orders.filter((o) => o.status === 'PENDING');
  const toPack = orders.filter((o) => o.status === 'ACCEPTED');
  const readyToDispatch = orders.filter((o) => o.status === 'PACKING');
  const inTransit = orders.filter((o) => o.status === 'DISPATCHED');
  const now = new Date();
  const lowStock = inventory.filter((i) => i.quantityAvailable < LOW_STOCK_THRESHOLD);
  const expiringSoon = inventory.filter((i) => {
    const daysLeft = (i.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysLeft >= 0 && daysLeft <= EXPIRING_WITHIN_DAYS;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{pharmacy.name || 'Your pharmacy application'}</h1>
        <VerificationBadge status={pharmacy.verificationStatus} />
      </div>

      {pharmacy.verificationStatus === 'REJECTED' && pharmacy.rejectionReason && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your last application was rejected: {pharmacy.rejectionReason}. Update your details below and resubmit.
        </p>
      )}
      {(pharmacy.verificationStatus === 'SUBMITTED' || pharmacy.verificationStatus === 'UNDER_REVIEW') && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          Your application is with the ABIES verification team. You&apos;ll be notified once it&apos;s reviewed.
        </p>
      )}
      {pharmacy.verificationStatus === 'SUSPENDED' && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your account has been suspended{pharmacy.rejectionReason ? `: ${pharmacy.rejectionReason}` : '.'} Contact ABIES support.
        </p>
      )}

      {editable && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Pharmacy name, license numbers, service areas.</CardDescription>
            <Link href="/pharmacy/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              Edit →
            </Link>
          </Card>
          <Card>
            <CardTitle className="text-base">Inventory ({inventory.length})</CardTitle>
            <CardDescription>Medicines you stock, batches, expiry and pricing.</CardDescription>
            <Link href="/pharmacy/inventory" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              Manage →
            </Link>
          </Card>
        </div>
      )}

      {editable && (
        <div className="mt-8">
          <SubmitButton />
        </div>
      )}

      {approved && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="New orders" value={newOrders.length} href="/pharmacy/orders" />
            <MetricCard title="To pack" value={toPack.length} href="/pharmacy/orders" />
            <MetricCard title="Ready to dispatch" value={readyToDispatch.length} href="/pharmacy/orders" />
            <MetricCard title="In transit" value={inTransit.length} href="/pharmacy/orders" />
            <MetricCard title="Low stock" value={lowStock.length} href="/pharmacy/inventory" />
            <MetricCard title="Expiring within 30 days" value={expiringSoon.length} href="/pharmacy/inventory" />
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">New orders</h2>
            {newOrders.length === 0 ? (
              <EmptyState message="No new orders right now." />
            ) : (
              <div className="mt-3 space-y-2">
                {newOrders.map((o) => (
                  <ListRow
                    key={o.id}
                    href={`/pharmacy/orders/${o.id}`}
                    title={patientName(o)}
                    subtitle={o.items.map((i) => i.medicine.name).join(', ')}
                  />
                ))}
              </div>
            )}
          </div>

          {(lowStock.length > 0 || expiringSoon.length > 0) && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Inventory needing attention</h2>
              <div className="mt-3 space-y-2">
                {lowStock.map((i) => (
                  <ListRow
                    key={`low-${i.id}`}
                    href="/pharmacy/inventory"
                    title={i.medicine.name}
                    subtitle={`Batch ${i.batchNumber}`}
                    trailing={<span className="text-sm font-medium text-brand-orange-600">{i.quantityAvailable} left</span>}
                  />
                ))}
                {expiringSoon.map((i) => (
                  <ListRow
                    key={`exp-${i.id}`}
                    href="/pharmacy/inventory"
                    title={i.medicine.name}
                    subtitle={`Batch ${i.batchNumber}`}
                    trailing={<span className="text-sm font-medium text-brand-magenta-600">Expires {i.expiryDate.toLocaleDateString('en-IN')}</span>}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
