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
import type { PublicTherapy } from '@abies/domain/modules/panchakarma/catalogue.service';

export function TherapyCard({ therapy, viewerRole }: { therapy: PublicTherapy; viewerRole: string | null }) {
  const router = useRouter();
  const [booking, setBooking] = useState(false);
  const [sessionCount, setSessionCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleBookAndPay() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{
        booking: { id: string };
        razorpayOrder: { id: string; amount: number; currency: string };
        razorpayKeyId: string;
      }>('/api/v1/panchakarma-bookings', {
        centreId: therapy.centre.id,
        therapyId: therapy.id,
        sessionCount,
      });

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment provider script did not load');

      const checkout = new window.Razorpay({
        key: result.razorpayKeyId,
        amount: result.razorpayOrder.amount,
        currency: result.razorpayOrder.currency,
        order_id: result.razorpayOrder.id,
        name: 'ABIES',
        description: `${therapy.name} — ${therapy.centre.name ?? 'Centre'}`,
        theme: { color: '#7A1783' },
        handler: async (response) => {
          try {
            await api.post('/api/v1/panchakarma-bookings/verify-payment', {
              bookingId: result.booking.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            router.push('/patient/panchakarma');
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
        🪷
      </div>
      <div className="p-[18px]">
        <Badge tone="success">Verified centre</Badge>
        <h3 className="mt-2 font-bold text-brand-neutral-900">{therapy.name}</h3>
        <p className="text-xs text-brand-neutral-500">
          {therapy.centre.name ?? 'Centre'} {therapy.centre.city ? `· ${therapy.centre.city}` : ''}
        </p>
        {therapy.description && <p className="mt-2 text-sm text-brand-neutral-500">{therapy.description}</p>}
        {therapy.durationMinutes && <p className="mt-1 text-xs text-brand-neutral-400">{therapy.durationMinutes} min per session</p>}
        {therapy.requiredSupervision && <Badge tone="orange" className="mt-2">Requires supervision</Badge>}
        {therapy.contraindications && <p className="mt-1 text-xs text-brand-neutral-400">Contraindications: {therapy.contraindications}</p>}

        {viewerRole !== 'PATIENT' ? (
          <div className="mt-3 text-sm text-brand-neutral-500">
            {viewerRole ? (
              'Only patients can book Panchakarma therapies.'
            ) : (
              <>
                <Link href="/login" className="font-medium text-brand-purple-700 underline">
                  Log in as a patient
                </Link>{' '}
                to book this therapy.
              </>
            )}
          </div>
        ) : booking ? (
          <div className="mt-3 space-y-3 border-t border-brand-neutral-100 pt-3">
            {error && <Alert tone="error">{error}</Alert>}
            <div>
              <Label htmlFor={`sessions-${therapy.id}`}>Number of sessions</Label>
              <Input
                id={`sessions-${therapy.id}`}
                type="number"
                min={1}
                max={60}
                value={sessionCount}
                onChange={(e) => setSessionCount(Number(e.target.value))}
              />
            </div>
            <Button size="sm" loading={submitting} onClick={handleBookAndPay}>
              Book & pay ₹{therapy.price * sessionCount}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-brand-neutral-400">Starting at</span>
              <div className="text-lg font-extrabold text-brand-neutral-900">₹{therapy.price}</div>
            </div>
            <Button size="sm" onClick={() => setBooking(true)}>
              Request slot
            </Button>
          </div>
        )}
      </div>
    </HoverCard>
  );
}
