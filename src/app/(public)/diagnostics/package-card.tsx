'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import { loadRazorpayScript } from '@/lib/razorpay-checkout';
import type { PublicPackage } from '@/modules/diagnostics/catalogue.service';

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
      }>('/api/diagnostic-orders', {
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
            await api.post('/api/diagnostic-orders/verify-payment', {
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
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-brand-neutral-900">{pkg.name}</h3>
          <p className="text-xs text-brand-neutral-500">{pkg.lab.name ?? 'Lab'}</p>
        </div>
        <Badge tone="blue">₹{pkg.price}</Badge>
      </div>
      {pkg.description && <p className="mt-2 text-sm text-brand-neutral-600">{pkg.description}</p>}
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
                className={`rounded-full px-3 py-1 text-xs font-medium ${collectionMode === 'HOME' ? 'bg-brand-purple-600 text-white' : 'bg-brand-neutral-100 text-brand-neutral-600'}`}
              >
                Home collection
              </button>
              <button
                type="button"
                onClick={() => setCollectionMode('LAB_VISIT')}
                className={`rounded-full px-3 py-1 text-xs font-medium ${collectionMode === 'LAB_VISIT' ? 'bg-brand-purple-600 text-white' : 'bg-brand-neutral-100 text-brand-neutral-600'}`}
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
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setBooking(true)}>
          Book
        </Button>
      )}
    </Card>
  );
}
