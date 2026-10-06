'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FieldError, Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

const QUERY_TYPES = [
  { value: 'GENERAL', label: 'General enquiry' },
  { value: 'APPOINTMENT', label: 'Doctor appointment' },
  { value: 'PANCHAKARMA', label: 'Panchakarma' },
  { value: 'DIAGNOSTICS', label: 'Diagnostics' },
  { value: 'ORDERS', label: 'Orders and delivery' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'ACCOUNT', label: 'Account and login' },
  { value: 'TECHNICAL', label: 'Website or app problem' },
  { value: 'OTHER', label: 'Other' },
];

const PREFERRED = [
  { value: '', label: 'No preference' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'PHONE', label: 'Phone' },
];

interface Submitted {
  referenceId: string;
  message: string;
}

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [queryType, setQueryType] = useState('GENERAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [preferredContact, setPreferredContact] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot. Hidden from people; a bot that fills it is refused by the server.
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Submitted | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api.post<Submitted>('/api/v1/contact', {
        name,
        email,
        mobile,
        queryType,
        subject,
        message,
        ...(preferredContact ? { preferredContact } : {}),
        consentAcknowledged: consent,
        website,
      });
      setDone(res);
    } catch (err) {
      if (err instanceof ApiError && err.issues?.length) {
        const map: Record<string, string> = {};
        for (const issue of err.issues) {
          const key = String(issue.path[0] ?? '');
          if (key && !map[key]) map[key] = issue.message;
        }
        setFieldErrors(map);
      }
      setError(err instanceof ApiError ? err.message : 'We could not send your enquiry. Please try again, or WhatsApp us.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="p-6">
        <Alert tone="info">{done.message}</Alert>
        <p className="mt-4 text-brand-neutral-800">
          Your reference number is <strong className="font-semibold">{done.referenceId}</strong>. Quote it in any follow-up.
        </p>
        <p className="mt-2 text-sm text-brand-neutral-600">A confirmation has been sent to {email.trim() || 'your email'}.</p>
        <Button className="mt-6" variant="secondary" onClick={() => setDone(null)}>
          Send another enquiry
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="contact-name">Full name *</Label>
          <Input id="contact-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          <FieldError>{fieldErrors.name}</FieldError>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-email">Email address *</Label>
            <Input id="contact-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
            <FieldError>{fieldErrors.email}</FieldError>
          </div>
          <div>
            <Label htmlFor="contact-mobile">Mobile number *</Label>
            <Input id="contact-mobile" type="tel" autoComplete="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit mobile" required />
            <FieldError>{fieldErrors.mobile}</FieldError>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-query">Query type *</Label>
            <Select id="contact-query" value={queryType} onChange={(e) => setQueryType(e.target.value)}>
              {QUERY_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldError>{fieldErrors.queryType}</FieldError>
          </div>
          <div>
            <Label htmlFor="contact-preferred">Preferred way to hear back</Label>
            <Select id="contact-preferred" value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)}>
              {PREFERRED.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="contact-subject">Subject *</Label>
          <Input id="contact-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required />
          <FieldError>{fieldErrors.subject}</FieldError>
        </div>

        <div>
          <Label htmlFor="contact-message">Message *</Label>
          <Textarea id="contact-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} minLength={10} maxLength={4000} required />
          <FieldError>{fieldErrors.message}</FieldError>
          <p className="mt-1 text-sm text-brand-neutral-500">
            Please don&apos;t include passwords, OTPs, card or bank details.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="contact-consent"
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <Label htmlFor="contact-consent" className="font-normal">
            I agree that ABIES may contact me by email about this enquiry. See our privacy policy.
          </Label>
        </div>
        <FieldError>{fieldErrors.consentAcknowledged}</FieldError>

        {/* Honeypot: hidden from people and screen readers. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" className="w-full" loading={busy} disabled={!consent}>
          Send enquiry
        </Button>
      </form>
    </Card>
  );
}
