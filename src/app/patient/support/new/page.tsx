'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import { recentFailedRequestId } from '@/lib/error-correlation';

const CATEGORY_OPTIONS = [
  { value: 'BOOKING', label: 'Booking & scheduling' },
  { value: 'PAYMENT', label: 'Payments & refunds' },
  { value: 'REPORT', label: 'Diagnostic report' },
  { value: 'MEDICINE', label: 'Medicine order' },
  { value: 'THERAPY', label: 'Panchakarma therapy' },
  { value: 'CLINICAL_CONCERN', label: 'Clinical safety concern' },
  { value: 'TECHNICAL_ISSUE', label: 'Something not working' },
  { value: 'GENERAL', label: 'General enquiry' },
];

const MODULE_OPTIONS = [
  { value: 'APPOINTMENTS', label: 'Appointments' },
  { value: 'DIAGNOSTICS', label: 'Diagnostics' },
  { value: 'MEDICINES', label: 'Medicines' },
  { value: 'PANCHAKARMA', label: 'Panchakarma' },
  { value: 'PAYMENTS', label: 'Payments' },
  { value: 'ACCOUNT', label: 'Account / login' },
  { value: 'OTHER', label: 'Other' },
];

const ERROR_TYPE_OPTIONS = [
  { value: 'PAGE_WONT_LOAD', label: "A page won't load" },
  { value: 'ACTION_FAILED', label: 'An action failed / showed an error' },
  { value: 'SLOW_PERFORMANCE', label: 'The app is slow' },
  { value: 'DATA_LOOKS_WRONG', label: 'Something looks wrong or missing' },
  { value: 'OTHER', label: 'Other' },
];

export default function NewTicketPage() {
  const router = useRouter();
  const [category, setCategory] = useState('BOOKING');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [technicalModule, setTechnicalModule] = useState(MODULE_OPTIONS[0]!.value);
  const [errorClassification, setErrorClassification] = useState(ERROR_TYPE_OPTIONS[0]!.value);
  const [correlationRequestId, setCorrelationRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Deferred to a microtask rather than called synchronously in the
    // effect body — same shape as this app's other mount-time client-only
    // reads (e.g. booking-widget.tsx's family-member fetch), which all
    // resolve setState from a .then() callback, not the effect body itself.
    Promise.resolve(recentFailedRequestId()).then(setCorrelationRequestId);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ ticket: { id: string } }>('/api/support/tickets', {
        category,
        subject,
        description,
        ...(category === 'TECHNICAL_ISSUE'
          ? { technicalModule, errorClassification, correlationRequestId: correlationRequestId ?? undefined }
          : {}),
      });
      router.push(`/patient/support/${result.ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open this ticket.');
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-brand-neutral-900">New support ticket</h1>
      {category === 'CLINICAL_CONCERN' && (
        <Alert tone="info" className="mt-4">
          Clinical safety concerns are routed to a dedicated escalation queue, separate from routine support — never
          handled by AI alone.
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
      <Card className="mt-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="category">What&apos;s this about?</Label>
            <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {category === 'TECHNICAL_ISSUE' && (
            <>
              <div>
                <Label htmlFor="technicalModule">Where did this happen?</Label>
                <Select id="technicalModule" value={technicalModule} onChange={(e) => setTechnicalModule(e.target.value)}>
                  {MODULE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="errorClassification">What went wrong?</Label>
                <Select id="errorClassification" value={errorClassification} onChange={(e) => setErrorClassification(e.target.value)}>
                  {ERROR_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              {correlationRequestId && (
                <Alert tone="info">
                  We found a recent error from your session and will attach it automatically ({correlationRequestId}) —
                  this helps engineering find exactly what happened.
                </Alert>
              )}
            </>
          )}

          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={200} required />
            <FieldError>{subject.length > 0 && subject.length < 3 ? 'Enter a short subject' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor="description">Describe the issue</Label>
            <Textarea
              id="description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={5000}
              required
            />
          </div>
          <Button type="submit" className="w-full" loading={busy}>
            Open ticket
          </Button>
        </form>
      </Card>
    </div>
  );
}
