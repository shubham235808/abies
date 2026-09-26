'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';

type Initial = {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  supervisingPractitioner: string;
  licenseNumbers: string[];
};

export function ProfileForm({ initial, editable }: { initial: Initial; editable: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [addressLine1, setAddressLine1] = useState(initial.addressLine1);
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [postalCode, setPostalCode] = useState(initial.postalCode);
  const [supervisingPractitioner, setSupervisingPractitioner] = useState(initial.supervisingPractitioner);
  const [licenseNumbersText, setLicenseNumbersText] = useState(initial.licenseNumbers.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/panchakarma-centres/me', {
        name: name || undefined,
        addressLine1: addressLine1 || undefined,
        city: city || undefined,
        state: state || undefined,
        postalCode: postalCode || undefined,
        supervisingPractitioner: supervisingPractitioner || undefined,
        licenseNumbers: licenseNumbersText.split('\n').map((l) => l.trim()).filter(Boolean),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return (
      <dl className="space-y-3 text-sm text-brand-neutral-700">
        <div>
          <dt className="font-medium text-brand-neutral-900">Centre name</dt>
          <dd>{initial.name || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Address</dt>
          <dd>{[initial.addressLine1, initial.city, initial.state, initial.postalCode].filter(Boolean).join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Supervising practitioner</dt>
          <dd>{initial.supervisingPractitioner || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">License numbers</dt>
          <dd>{initial.licenseNumbers.join(', ') || '—'}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Centre name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="addressLine1">Address</Label>
        <Input id="addressLine1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="postalCode">Postal code</Label>
          <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="supervisingPractitioner">Supervising practitioner</Label>
        <Input id="supervisingPractitioner" value={supervisingPractitioner} onChange={(e) => setSupervisingPractitioner(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="licenseNumbers">License numbers (one per line)</Label>
        <Textarea id="licenseNumbers" rows={3} value={licenseNumbersText} onChange={(e) => setLicenseNumbersText(e.target.value)} />
      </div>
      <Button loading={saving} onClick={handleSave}>
        Save profile
      </Button>
    </div>
  );
}
