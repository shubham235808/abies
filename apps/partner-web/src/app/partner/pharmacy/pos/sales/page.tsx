import Link from 'next/link';
import { Card } from '@abies/design-system/components/ui/card';
import { listMySales } from '@abies/domain/modules/medicines/pos.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

export default async function PharmacySalesPage() {
  const session = await requireSessionOrRedirect();
  const sales = await listMySales(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Sales</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">Recent POS counter sales.</p>

      <div className="mt-6 space-y-3">
        {sales.map((sale) => (
          <Link key={sale.id} href={`/partner/pharmacy/pos/sales/${sale.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-brand-neutral-900">{sale.invoice?.invoiceNumber ?? sale.id}</p>
                  <p className="text-sm text-brand-neutral-500">
                    {sale.customerName ?? 'Walk-in customer'} · {sale.items.length} item(s) · {sale.paymentMethod}
                  </p>
                </div>
                <p className="font-semibold text-brand-neutral-900">₹{sale.totalAmount}</p>
              </div>
              <p className="mt-1 text-xs text-brand-neutral-400">{new Date(sale.createdAt).toLocaleString()}</p>
            </Card>
          </Link>
        ))}
        {sales.length === 0 && <p className="text-sm text-brand-neutral-500">No sales recorded yet.</p>}
      </div>
    </div>
  );
}
