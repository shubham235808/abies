'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { HoverCard } from '@abies/design-system/components/ui/card';
import { Input, Label } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';
import { loadRazorpayScript } from '../../../lib/razorpay-checkout';
import type { PublicPackage } from '@abies/domain/modules/diagnostics/catalogue.service';

// Direct pattern reuse of test-card.tsx — the only real difference is
// posting packageId instead of testIds to the shared /api/diagnostic-orders
// endpoint (bookOrderSchema treats the two as mutually exclusive).
export function PackageCard({ diagnosticPackage: pkg, viewerRole }: { diagnosticPackage: PublicPackage; viewerRole: string | null }) {
  const router = useRouter();
  const [booking, setBooking] = useState(false);
  const [collectionMode, setCollectionMode] = useState<'HOME' | 'LAB_VISIT'>(pkg.lab.homeCollectionSupported ? 'HOME' : 'LAB_VISIT');
  const [address, setAddress] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleBookAndPay() {
    if (!scheduledAt) {
      setError('Choose a date and time');
      return;
    }
    if (collectionMode === 'HOME' && !address) {
      setError('Address is required for home collection');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{
        order: { id: string };
        razorpayOrder: { id: string; amount: number; currency: string };
        razorpayKeyId: string;
      }>('/api/v1/diagnostic-orders', {
        labId: pkg.lab.id,
        packageId: pkg.id,
        collectionMode,
        address: collectionMode === 'HOME' ? address : undefined,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment provider script did not load');

      const checkout = new window.Razorpay({
        key: result.razorpayKeyId,
        amount: result.razorpayOrder.amount,
        currency: result.razorpayOrder.currency,
        order_id: result.razorpayOrder.id,
        name: 'ABIES',
        description: `${pkg.name} — ${pkg.lab.name ?? 'Lab'}`,
        theme: { color: '#7A1783' },
        handler: async (response) => {
          try {
            await api.post('/api/v1/diagnostic-orders/verify-payment', {
              orderId: result.order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            router.push('/patient/diagnostics');
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Payment succeeded but confirmation failed — contact support.');
          }
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start booking.');
      setSubmitting(false);
    }
  }

  return (
    <HoverCard className="overflow-hidden">
      <div className="flex h-[145px] items-center justify-center bg-gradient-to-br from-brand-purple-50 to-brand-blue-50 text-5xl">
        🧬
      </div>
      <div className="p-[18px]">
        <Badge tone="success">Home collection available</Badge>
        <h3 className="mt-2 font-bold text-brand-neutral-900">{pkg.name}</h3>
        <p className="text-xs text-brand-neutral-500">{pkg.lab.name ?? 'Lab'}</p>
        {pkg.description && <p className="mt-2 text-sm text-brand-neutral-500">{pkg.description}</p>}
        {pkg.testNames.length > 0 && <p className="mt-1 text-xs text-brand-neutral-400">Includes: {pkg.testNames.join(', ')}</p>}

        {viewerRole !== 'PATIENT' ? (
          <div className="mt-3 text-sm text-brand-neutral-500">
            {viewerRole ? (
              'Only patients can book diagnostic packages.'
            ) : (
              <>
                <Link href="/login" className="font-medium text-brand-purple-700 underline">
                  Log in as a patient
                </Link>{' '}
                to book this package.
              </>
            )}
          </div>
        ) : booking ? (
          <div className="mt-3 space-y-3 border-t border-brand-neutral-100 pt-3">
            {error && <Alert tone="error">{error}</Alert>}
            {pkg.lab.homeCollectionSupported && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCollectionMode('HOME')}
                  className={`rounded-pill px-3 py-1 text-xs font-bold ${collectionMode === 'HOME' ? 'bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 text-white' : 'bg-brand-neutral-100 text-brand-neutral-600'}`}
                >
                  Home collection
                </button>
                <button
                  type="button"
                  onClick={() => setCollectionMode('LAB_VISIT')}
                  className={`rounded-pill px-3 py-1 text-xs font-bold ${collectionMode === 'LAB_VISIT' ? 'bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 text-white' : 'bg-brand-neutral-100 text-brand-neutral-600'}`}
                >
                  Lab visit
                </button>
              </div>
            )}
            {collectionMode === 'HOME' && (
              <div>
                <Label htmlFor={`address-${pkg.id}`}>Collection address</Label>
                <Input id={`address-${pkg.id}`} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            )}
            <div>
              <Label htmlFor={`scheduledAt-${pkg.id}`}>Preferred date & time</Label>
              <Input
                id={`scheduledAt-${pkg.id}`}
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <Button size="sm" loading={submitting} onClick={handleBookAndPay}>
              Book & pay ₹{pkg.price}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-lg font-extrabold text-brand-neutral-900">₹{pkg.price}</div>
            <Button size="sm" onClick={() => setBooking(true)}>
              Add
            </Button>
          </div>
        )}
      </div>
    </HoverCard>
  );
}
