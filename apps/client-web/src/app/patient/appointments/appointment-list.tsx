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
  doctorProfile: { slug: string; title: string; firstName: string | null; lastName: string | null };
  careRecipientFamilyMember: { name: string } | null;
  payment: { status: string; amount: number } | null;
  clinic: { name: string; city: string } | null;
  consultation: { id: string; status: string } | null;
  hasReview: boolean;
};

const CANCELLABLE = new Set(['PENDING_PAYMENT', 'CONFIRMED']);

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n)}
          className={n <= value ? 'text-lg text-brand-purple-600' : 'text-lg text-brand-neutral-300'}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function DoctorReviewForm({ appointmentId, onSubmitted }: { appointmentId: string; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/appointments/${appointmentId}/review`, { rating, comment: comment || undefined });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Leave a review
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <StarPicker value={rating} onChange={setRating} />
      <Textarea placeholder="Your experience (optional)" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Never mind
        </Button>
        <Button size="sm" loading={submitting} onClick={submit}>
          Submit review
        </Button>
      </div>
    </div>
  );
}

export function AppointmentList({ initial }: { initial: Appointment[]; viewerRole: 'PATIENT' }) {
  const [appointments, setAppointments] = useState(initial);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleReviewed(appointmentId: string) {
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, hasReview: true } : a)));
  }

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
        const doctorName = [a.doctorProfile.title, a.doctorProfile.firstName, a.doctorProfile.lastName].filter(Boolean).join(' ');
        return (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/doctors/${a.doctorProfile.slug}`} className="font-medium text-brand-purple-700 hover:underline">
                  {doctorName}
                </Link>
                <p className="mt-1 text-sm text-brand-neutral-600">
                  {new Date(a.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                  {a.durationMinutes} min · {a.mode === 'VIDEO' ? 'Video' : `Clinic — ${a.clinic?.name ?? ''}`}
                </p>
                {a.careRecipientFamilyMember && (
                  <p className="mt-1 text-xs text-brand-neutral-500">For {a.careRecipientFamilyMember.name}</p>
                )}
                {a.reasonForVisit && <p className="mt-1 text-xs text-brand-neutral-500">{a.reasonForVisit}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <AppointmentStatusBadge status={a.status} />
                {a.payment && <span className="text-xs text-brand-neutral-500">₹{a.payment.amount} · {a.payment.status}</span>}
              </div>
            </div>

            {a.status === 'CONFIRMED' && a.payment?.status === 'SUCCESS' && (
              <p className="mt-2 text-xs text-brand-neutral-400">
                Cancelling a paid appointment does not automatically refund payment yet — contact support for refunds.
              </p>
            )}

            {a.consultation && a.consultation.status !== 'CANCELLED' && (
              <div className="mt-3 border-t border-brand-neutral-100 pt-3">
                <Link href={`/patient/consultations/${a.consultation.id}`} className="text-sm font-medium text-brand-purple-700 hover:underline">
                  {a.consultation.status === 'COMPLETED' ? 'View consultation notes & prescription' : 'View consultation'} →
                </Link>
              </div>
            )}

            {a.status === 'COMPLETED' && (
              <div className="mt-3 border-t border-brand-neutral-100 pt-3">
                {a.hasReview ? (
                  <p className="text-sm text-brand-neutral-500">You reviewed this appointment. Thank you!</p>
                ) : (
                  <DoctorReviewForm appointmentId={a.id} onSubmitted={() => handleReviewed(a.id)} />
                )}
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
