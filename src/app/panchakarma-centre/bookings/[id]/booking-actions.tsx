'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { PanchakarmaBookingStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';

type SessionRow = { id: string; sessionNumber: number; scheduledAt: string; attendedAt: string | null; therapistName: string | null };
type Therapist = { id: string; name: string };

// Same lesson as src/app/lab/orders/[id]/order-actions.tsx and
// src/app/pharmacy/orders/[id]/order-actions.tsx (Phases 7-8): a Client
// Component's useState only takes its initial value from props at mount
// and never re-syncs on its own, so every action here (scheduling a
// session, marking one attended, cancelling) updates this state directly
// from that action's own response rather than relying on router.refresh().
export function BookingActions({
  bookingId,
  status: initialStatus,
  sessionCount,
  therapists,
  sessions: initialSessions,
}: {
  bookingId: string;
  status: string;
  sessionCount: number;
  therapists: Therapist[];
  sessions: SessionRow[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [scheduledAt, setScheduledAt] = useState('');
  const [therapistId, setTherapistId] = useState('');

  async function handleSchedule() {
    if (!scheduledAt) {
      setError('Choose a date and time');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ session: SessionRow; booking: { status: string } }>(
        `/api/panchakarma-centres/me/bookings/${bookingId}/schedule-session`,
        { scheduledAt: new Date(scheduledAt).toISOString(), therapistId: therapistId || undefined },
      );
      setSessions((prev) => [...prev, result.session]);
      setStatus(result.booking.status);
      setScheduledAt('');
      setTherapistId('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not schedule this session.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkAttended(sessionId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ session: SessionRow; booking: { status: string } }>(
        `/api/panchakarma-centres/me/sessions/${sessionId}/attended`,
        {},
      );
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? result.session : s)));
      setStatus(result.booking.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark this session attended.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      const { booking } = await api.post<{ booking: { status: string } }>(`/api/panchakarma-bookings/${bookingId}/cancel`, {});
      setStatus(booking.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this booking.');
    } finally {
      setBusy(false);
    }
  }

  const canScheduleMore = sessions.length < sessionCount && (status === 'BOOKED' || status === 'SCHEDULED' || status === 'IN_PROGRESS');
  const cancellable = status === 'BOOKED' || status === 'SCHEDULED';

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-neutral-900">
          Sessions ({sessions.length}/{sessionCount})
        </h2>
        <PanchakarmaBookingStatusBadge status={status} />
      </div>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      <ul className="mt-3 space-y-2 text-sm text-brand-neutral-700">
        {sessions.length === 0 && <li className="text-brand-neutral-400">No sessions scheduled yet.</li>}
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 border-b border-brand-neutral-100 pb-2">
            <span>
              Session {s.sessionNumber}: {new Date(s.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              {s.therapistName ? ` — ${s.therapistName}` : ''}
            </span>
            {s.attendedAt ? (
              <span className="text-xs text-emerald-700">Attended</span>
            ) : (
              <Button variant="ghost" size="sm" loading={busy} onClick={() => handleMarkAttended(s.id)}>
                Mark attended
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canScheduleMore && (
        <div className="mt-4 space-y-3 border-t border-brand-neutral-100 pt-4">
          <div>
            <Label htmlFor="scheduledAt">Schedule next session</Label>
            <Input id="scheduledAt" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          {therapists.length > 0 && (
            <div>
              <Label htmlFor="therapistId">Therapist (optional)</Label>
              <Select id="therapistId" value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
                <option value="">Unassigned</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button loading={busy} onClick={handleSchedule}>
            Schedule session
          </Button>
        </div>
      )}

      {cancellable && (
        <div className="mt-4 border-t border-brand-neutral-100 pt-4">
          <Button variant="ghost" loading={busy} onClick={handleCancel}>
            Cancel booking
          </Button>
        </div>
      )}

      {status === 'COMPLETED' && <p className="mt-4 text-sm text-brand-neutral-500">This course is complete.</p>}
      {status === 'CANCELLED' && <p className="mt-4 text-sm text-brand-neutral-500">This booking was cancelled.</p>}
    </Card>
  );
}
