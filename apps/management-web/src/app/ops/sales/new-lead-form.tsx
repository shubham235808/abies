'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

const KIND_OPTIONS = ['DOCTOR', 'CLINIC', 'LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE', 'CORPORATE'];

export function NewLeadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('DOCTOR');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [city, setCity] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/partner-leads', { kind, contactName, contactPhone, city: city || undefined, source: source || undefined });
      setOpen(false);
      setContactName('');
      setContactPhone('');
      setCity('');
      setSource('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this lead.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-4">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          + Add lead
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-4">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="kind">Partner kind</Label>
          <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="source">Source</Label>
          <Input id="source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Referral, city team, inbound..." />
        </div>
        <div>
          <Label htmlFor="contactName">Contact name</Label>
          <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="contactPhone">Contact phone</Label>
          <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit" loading={busy}>
            Save lead
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
