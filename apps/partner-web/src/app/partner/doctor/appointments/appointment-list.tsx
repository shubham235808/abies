'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert } from '@abies/design-system/components/ui/alert';
import { AppointmentStatusBadge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type Appointment = {
  id: string;
  mode: 'VIDEO' | 'CLINIC';
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  reasonForVisit: string | null;
  patientUser: { mobile: string; patientProfile: { firstName: string | null; lastName: string | null } | null };
  careRecipientFamilyMember: { name: string } | null;
  clinic: { name: string; city: string } | null;
  consultation: { id: string; status: string } | null;
};

const CONSULTATION_LABEL: Record<string, string> = {
  SCHEDULED: 'Start consultation',
  IN_PROGRESS: 'Continue consultation',
  COMPLETED: 'View consultation notes & prescription',
};

const CANCELLABLE = new Set(['PENDING_PAYMENT', 'CONFIRMED']);

export function AppointmentList({ initial }: { initial: Appointment[] }) {
  const [appointments, setAppointments] = useState(initial);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirmCancel(id: string) {
    setSubmitting(true);
    setError(null);
    try {
      const { appointment } = await api.post<{ appointment: { status: string } }>(`/api/v1/appointments/${id}/cancel`, {
        reason: reason || undefined,
      });
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: appointment.status } : a)));
      setCancellingId(null);
      setReason('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this appointment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (appointments.length === 0) {
    return <p className="text-sm text-brand-neutral-500">No appointments yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {appointments.map((a) => {
        const patientName =
          [a.patientUser.patientProfile?.firstName, a.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
          a.patientUser.mobile;
        return (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-brand-neutral-900">{patientName}</p>
                <p className="mt-1 text-sm text-brand-neutral-600">
                  {new Date(a.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                  {a.durationMinutes} min · {a.mode === 'VIDEO' ? 'Video' : `Clinic — ${a.clinic?.name ?? ''}`}
                </p>
                {a.careRecipientFamilyMember && (
                  <p className="mt-1 text-xs text-brand-neutral-500">For {a.careRecipientFamilyMember.name}</p>
                )}
                {a.reasonForVisit && <p className="mt-1 text-xs text-brand-neutral-500">{a.reasonForVisit}</p>}
              </div>
              <AppointmentStatusBadge status={a.status} />
            </div>

            {a.consultation && a.consultation.status !== 'CANCELLED' && (
              <div className="mt-3 border-t border-brand-neutral-100 pt-3">
                <Link href={`/partner/doctor/consultations/${a.consultation.id}`} className="text-sm font-medium text-brand-purple-700 hover:underline">
                  {CONSULTATION_LABEL[a.consultation.status] ?? 'View consultation'} →
                </Link>
              </div>
            )}

            {CANCELLABLE.has(a.status) && (
              <div className="mt-3 border-t border-brand-neutral-100 pt-3">
                {cancellingId === a.id ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Reason (optional)"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setCancellingId(null)}>
                        Never mind
                      </Button>
                      <Button variant="danger" size="sm" loading={submitting} onClick={() => confirmCancel(a.id)}>
                        Confirm cancellation
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setCancellingId(a.id)}>
                    Cancel appointment
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
