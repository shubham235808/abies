'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';

const CATEGORY_OPTIONS = [
  { value: 'BOOKING', label: 'Booking & scheduling' },
  { value: 'PAYMENT', label: 'Payments & refunds' },
  { value: 'REPORT', label: 'Diagnostic report' },
  { value: 'MEDICINE', label: 'Medicine order' },
  { value: 'THERAPY', label: 'Panchakarma therapy' },
  { value: 'CLINICAL_CONCERN', label: 'Clinical safety concern' },
  { value: 'GENERAL', label: 'General enquiry' },
];

export default function NewTicketPage() {
  const router = useRouter();
  const [category, setCategory] = useState('BOOKING');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ ticket: { id: string } }>('/api/support/tickets', { category, subject, description });
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
