'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { PanchakarmaBookingStatusBadge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { api, ApiError } from '@abies/design-system/api-client';

type Booking = {
  id: string;
  status: string;
  centreName: string | null;
  therapyName: string | null;
  sessionCount: number;
  attendedCount: number;
};

const CANCELLABLE = new Set(['BOOKED', 'SCHEDULED']);

export function BookingList({ initial }: { initial: Booking[] }) {
  const [bookings, setBookings] = useState(initial);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCancellingId(id);
    setError(null);
    try {
      const { booking } = await api.post<{ booking: { status: string } }>(`/api/panchakarma-bookings/${id}/cancel`, {});
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: booking.status } : b)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this booking.');
    } finally {
      setCancellingId(null);
    }
  }

  if (bookings.length === 0) {
    return <p className="text-sm text-brand-neutral-500">No bookings yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {bookings.map((b) => (
        <Card key={b.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-brand-neutral-900">{b.therapyName ?? 'Therapy'}</p>
              <p className="mt-1 text-sm text-brand-neutral-600">{b.centreName}</p>
              <p className="mt-1 text-xs text-brand-neutral-400">
                {b.attendedCount}/{b.sessionCount} sessions attended
              </p>
            </div>
            <PanchakarmaBookingStatusBadge status={b.status} />
          </div>

          {CANCELLABLE.has(b.status) && (
            <div className="mt-3 border-t border-brand-neutral-100 pt-3">
              <Button variant="ghost" size="sm" loading={cancellingId === b.id} onClick={() => handleCancel(b.id)}>
                Cancel booking
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
