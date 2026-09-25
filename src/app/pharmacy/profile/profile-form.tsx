'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';

type Initial = {
  name: string;
  licenseNumbers: string[];
  serviceAreas: string[];
};

export function ProfileForm({ initial, editable }: { initial: Initial; editable: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [licenseNumbersText, setLicenseNumbersText] = useState(initial.licenseNumbers.join('\n'));
  const [serviceAreasText, setServiceAreasText] = useState(initial.serviceAreas.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/pharmacies/me', {
        name: name || undefined,
        licenseNumbers: licenseNumbersText.split('\n').map((l) => l.trim()).filter(Boolean),
        serviceAreas: serviceAreasText.split('\n').map((c) => c.trim()).filter(Boolean),
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
          <dt className="font-medium text-brand-neutral-900">Pharmacy name</dt>
          <dd>{initial.name || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">License numbers</dt>
          <dd>{initial.licenseNumbers.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Service areas</dt>
          <dd>{initial.serviceAreas.join(', ') || '—'}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Pharmacy name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="licenseNumbers">License numbers (one per line)</Label>
        <Textarea id="licenseNumbers" rows={3} value={licenseNumbersText} onChange={(e) => setLicenseNumbersText(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="serviceAreas">Service areas (one per line)</Label>
        <Textarea id="serviceAreas" rows={3} value={serviceAreasText} onChange={(e) => setServiceAreasText(e.target.value)} />
      </div>
      <Button loading={saving} onClick={handleSave}>
        Save profile
      </Button>
    </div>
  );
}
