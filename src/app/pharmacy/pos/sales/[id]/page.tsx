import Link from 'next/link';
import { getSale } from '@/modules/medicines/pos.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { PrintButton } from './print-button';

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;
  const sale = await getSale(session.userId, id);
  const taxSettings = sale.pharmacy.taxSettings;

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/pharmacy/pos/sales" className="text-sm font-medium text-brand-purple-600">
          ← Back to sales
        </Link>
        <PrintButton />
      </div>

      <div className="mt-4 rounded-card border border-brand-neutral-200 bg-white p-6 print:border-none print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-brand-neutral-900">{taxSettings?.legalBusinessName ?? sale.pharmacy.name}</p>
            {taxSettings && <p className="text-xs text-brand-neutral-500">GSTIN {taxSettings.gstin} · {taxSettings.registeredState}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-brand-neutral-900">{sale.invoice?.invoiceNumber ?? 'No invoice'}</p>
            <p className="text-xs text-brand-neutral-500">{new Date(sale.createdAt).toLocaleString()}</p>
          </div>
        </div>

        {(sale.customerName || sale.customerPhone) && (
          <p className="mt-3 text-sm text-brand-neutral-600">
            Billed to: {sale.customerName ?? '—'} {sale.customerPhone ? `· ${sale.customerPhone}` : ''}
          </p>
        )}

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-brand-neutral-200 text-left text-xs uppercase tracking-wide text-brand-neutral-400">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">GST</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-b border-brand-neutral-100">
                <td className="py-2">
                  {item.medicine.name}
                  <span className="ml-1 text-xs text-brand-neutral-400">batch {item.batchNumber}</span>
                </td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">₹{item.unitPrice}</td>
                <td className="py-2 text-right">{item.taxRate}%</td>
                <td className="py-2 text-right">₹{item.unitPrice * item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-brand-neutral-600">
            <span>Subtotal</span>
            <span>₹{sale.subtotal}</span>
          </div>
          {sale.discountAmount > 0 && (
            <div className="flex justify-between text-brand-neutral-600">
              <span>Discount</span>
              <span>−₹{sale.discountAmount}</span>
            </div>
          )}
          {sale.invoice && (
            <>
              <div className="flex justify-between text-brand-neutral-600">
                <span>CGST</span>
                <span>₹{sale.invoice.cgst}</span>
              </div>
              <div className="flex justify-between text-brand-neutral-600">
                <span>SGST</span>
                <span>₹{sale.invoice.sgst}</span>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-brand-neutral-200 pt-1 font-semibold text-brand-neutral-900">
            <span>Total</span>
            <span>₹{sale.totalAmount}</span>
          </div>
          <p className="pt-1 text-xs text-brand-neutral-400">Paid via {sale.paymentMethod}{sale.upiReference ? ` (${sale.upiReference})` : ''}</p>
        </div>
      </div>
    </div>
  );
}
