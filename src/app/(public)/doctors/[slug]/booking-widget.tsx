'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label, Select, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';

type Slot = { startsAt: string; endsAt: string; mode: 'VIDEO' | 'CLINIC'; clinicId: string | null };
type FamilyMember = { id: string; name: string };

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window.Razorpay !== 'undefined') return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment provider script'));
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

function groupByDate(slots: Slot[]): Map<string, Slot[]> {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = new Date(slot.startsAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const existing = groups.get(key) ?? [];
    existing.push(slot);
    groups.set(key, existing);
  }
  return groups;
}

export function BookingWidget({
  doctorProfileId,
  doctorName,
  modes,
  videoFee,
  clinicFee,
  viewerRole,
}: {
  doctorProfileId: string;
  doctorName: string;
  modes: ('VIDEO' | 'CLINIC')[];
  videoFee: number | null;
  clinicFee: number | null;
  viewerRole: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'VIDEO' | 'CLINIC'>(modes[0] ?? 'VIDEO');
  // Keyed by doctorProfileId+mode so a stale in-flight response for a mode
  // the visitor has since switched away from can never overwrite the
  // current one, and "loading" can be derived (result's key !== the
  // current key) instead of tracked as a separate flag that an effect
  // would need to set synchronously.
  const [result, setResult] = useState<{ key: string; slots: Slot[] } | { key: string; error: string } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [careRecipientId, setCareRecipientId] = useState('');
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const fee = mode === 'VIDEO' ? videoFee : clinicFee;
  const canBook = viewerRole === 'PATIENT';
  const requestKey = `${doctorProfileId}|${mode}`;
  const loadingSlots = canBook && result?.key !== requestKey;

  useEffect(() => {
    if (!canBook) return;
    api
      .get<{ members: FamilyMember[] }>('/api/patients/me/family')
      .then((res) => setFamilyMembers(res.members))
      .catch(() => setFamilyMembers([]));
  }, [canBook]);

  useEffect(() => {
    if (!canBook) return;
    let ignore = false;
    api
      .get<{ slots: Slot[] }>(`/api/appointments/slots?doctorProfileId=${doctorProfileId}&mode=${mode}`)
      .then((res) => {
        if (!ignore) setResult({ key: requestKey, slots: res.slots });
      })
      .catch((err) => {
        if (!ignore) setResult({ key: requestKey, error: err instanceof ApiError ? err.message : 'Could not load available slots.' });
      });
    return () => {
      ignore = true;
    };
  }, [canBook, doctorProfileId, mode, requestKey]);

  const currentSlots = useMemo(
    () => (result && result.key === requestKey && 'slots' in result ? result.slots : []),
    [result, requestKey],
  );
  const slotsError = result && result.key === requestKey && 'error' in result ? result.error : null;
  const grouped = useMemo(() => groupByDate(currentSlots), [currentSlots]);

  async function handleBookAndPay() {
    if (!selectedSlot) return;
    setError(null);
    setBooking(true);
    try {
      const result = await api.post<{
        appointment: { id: string };
        razorpayOrder: { id: string; amount: number; currency: string };
        razorpayKeyId: string;
      }>('/api/appointments/hold', {
        doctorProfileId,
        mode,
        startsAt: selectedSlot.startsAt,
        careRecipientFamilyMemberId: careRecipientId || undefined,
        reasonForVisit: reasonForVisit || undefined,
      });

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment provider script did not load');

      const checkout = new window.Razorpay({
        key: result.razorpayKeyId,
        amount: result.razorpayOrder.amount,
        currency: result.razorpayOrder.currency,
        order_id: result.razorpayOrder.id,
        name: 'ABIES',
        description: `Consultation with ${doctorName}`,
        theme: { color: '#7A1783' },
        handler: async (response) => {
          try {
            await api.post('/api/appointments/verify-payment', {
              appointmentId: result.appointment.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            router.push('/patient/appointments');
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Payment succeeded but confirmation failed — contact support.');
          }
        },
        modal: {
          ondismiss: () => setBooking(false),
        },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start booking.');
      setBooking(false);
    }
  }

  if (!canBook) {
    return (
      <Card className="mt-10">
        <h2 className="font-semibold text-brand-neutral-900">Book an appointment</h2>
        <Alert tone="info" className="mt-3">
          {viewerRole ? 'Only patients can book appointments.' : (
            <>
              <Link href="/login" className="font-medium underline">
                Log in as a patient
              </Link>{' '}
              to book an appointment with this doctor.
            </>
          )}
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="mt-10">
      <h2 className="font-semibold text-brand-neutral-900">Book an appointment</h2>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      {modes.length > 1 && (
        <div className="mt-4 flex gap-2">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setSelectedSlot(null);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                mode === m ? 'bg-brand-purple-600 text-white' : 'bg-brand-neutral-100 text-brand-neutral-600'
              }`}
            >
              {m === 'VIDEO' ? 'Video consultation' : 'Clinic visit'}
            </button>
          ))}
        </div>
      )}
      {fee != null && <p className="mt-2 text-sm text-brand-neutral-600">Fee: ₹{fee}</p>}

      <div className="mt-4">
        {loadingSlots && <p className="text-sm text-brand-neutral-500">Loading available slots…</p>}
        {slotsError && (
          <Alert tone="error" className="mb-3">
            {slotsError}
          </Alert>
        )}
        {!loadingSlots && !slotsError && currentSlots.length === 0 && (
          <p className="text-sm text-brand-neutral-500">No available slots in the next two weeks for this mode.</p>
        )}
        {!loadingSlots && [...grouped.entries()].map(([date, daySlots]) => (
          <div key={date} className="mb-3">
            <p className="mb-1.5 text-xs font-medium text-brand-neutral-500">{date}</p>
            <div className="flex flex-wrap gap-1.5">
              {daySlots.map((s) => (
                <button
                  key={s.startsAt}
                  type="button"
                  onClick={() => setSelectedSlot(s)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                    selectedSlot?.startsAt === s.startsAt
                      ? 'border-brand-purple-500 bg-brand-purple-50 text-brand-purple-700'
                      : 'border-brand-neutral-200 text-brand-neutral-700 hover:border-brand-purple-300'
                  }`}
                >
                  {new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedSlot && (
        <div className="mt-5 space-y-4 border-t border-brand-neutral-100 pt-4">
          {familyMembers.length > 0 && (
            <div>
              <Label htmlFor="careRecipient">Who is this visit for?</Label>
              <Select id="careRecipient" value={careRecipientId} onChange={(e) => setCareRecipientId(e.target.value)}>
                <option value="">Myself</option>
                {familyMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="reason">Reason for visit (optional)</Label>
            <Textarea id="reason" rows={2} value={reasonForVisit} onChange={(e) => setReasonForVisit(e.target.value)} />
          </div>
          <Button onClick={handleBookAndPay} loading={booking}>
            {fee != null ? `Book & pay ₹${fee}` : 'Book appointment'}
          </Button>
        </div>
      )}
    </Card>
  );
}
