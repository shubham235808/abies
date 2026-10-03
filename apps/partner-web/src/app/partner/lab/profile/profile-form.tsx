'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type Initial = {
  name: string;
  licenseNumbers: string[];
  serviceCities: string[];
  homeCollectionSupported: boolean;
};

export function ProfileForm({ initial, editable }: { initial: Initial; editable: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [licenseNumbersText, setLicenseNumbersText] = useState(initial.licenseNumbers.join('\n'));
  const [serviceCitiesText, setServiceCitiesText] = useState(initial.serviceCities.join('\n'));
  const [homeCollectionSupported, setHomeCollectionSupported] = useState(initial.homeCollectionSupported);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/labs/me', {
        name: name || undefined,
        licenseNumbers: licenseNumbersText.split('\n').map((l) => l.trim()).filter(Boolean),
        serviceCities: serviceCitiesText.split('\n').map((c) => c.trim()).filter(Boolean),
        homeCollectionSupported,
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
          <dt className="font-medium text-brand-neutral-900">Lab name</dt>
          <dd>{initial.name || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">License numbers</dt>
          <dd>{initial.licenseNumbers.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Service cities</dt>
          <dd>{initial.serviceCities.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Home collection</dt>
          <dd>{initial.homeCollectionSupported ? 'Supported' : 'Not offered'}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Lab name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="licenseNumbers">License numbers (one per line)</Label>
        <Textarea id="licenseNumbers" rows={3} value={licenseNumbersText} onChange={(e) => setLicenseNumbersText(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="serviceCities">Service cities (one per line)</Label>
        <Textarea id="serviceCities" rows={3} value={serviceCitiesText} onChange={(e) => setServiceCitiesText(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" checked={homeCollectionSupported} onChange={(e) => setHomeCollectionSupported(e.target.checked)} />
        We offer home sample collection
      </label>
      <Button loading={saving} onClick={handleSave}>
        Save profile
      </Button>
    </div>
  );
}
