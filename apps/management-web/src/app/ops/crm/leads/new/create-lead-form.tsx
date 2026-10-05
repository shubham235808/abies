'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';

const SOURCES = [
  'WEBSITE', 'MOBILE_APP', 'INSTAGRAM', 'FACEBOOK', 'GOOGLE', 'WHATSAPP', 'PHONE', 'WALK_IN',
  'DOCTOR_REFERRAL', 'PATIENT_REFERRAL', 'CAMPAIGN', 'PANCHAKARMA_ENQUIRY', 'DIAGNOSTICS_ENQUIRY',
  'PRODUCT_ENQUIRY', 'PHARMACY_ENQUIRY', 'MANUAL', 'OTHER',
];

export function CreateLeadForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch('/api/v1/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          tags: typeof data.tags === 'string' && data.tags ? data.tags.split(',').map((t) => t.trim()) : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = Array.isArray(body?.issues) ? body.issues[0]?.message : undefined;
        throw new Error(first ?? body?.error ?? 'Could not create this lead.');
      }
      router.push(`/ops/crm/leads/${body.lead.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this lead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 p-5">
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required minLength={1} />
        </div>
        <div>
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" />
        </div>
        <div>
          <Label htmlFor="mobile">Mobile</Label>
          <Input id="mobile" name="mobile" inputMode="numeric" placeholder="98765 43210" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" name="state" />
        </div>
        <div>
          <Label htmlFor="pinCode">PIN code</Label>
          <Input id="pinCode" name="pinCode" inputMode="numeric" maxLength={6} />
        </div>
        <div>
          <Label htmlFor="preferredLanguage">Preferred language</Label>
          <Input id="preferredLanguage" name="preferredLanguage" placeholder="Hindi" />
        </div>
        <div>
          <Label htmlFor="source">Source</Label>
          <Select id="source" name="source" required defaultValue="MANUAL">
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="interestedService">Interested service</Label>
          <Input id="interestedService" name="interestedService" placeholder="Panchakarma package" />
        </div>
        <div>
          <Label htmlFor="campaign">Campaign</Label>
          <Input id="campaign" name="campaign" />
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue="MEDIUM">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input id="tags" name="tags" placeholder="panchakarma, agra" />
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <Button type="submit" loading={busy}>Create lead</Button>
        </div>
      </form>
    </Card>
  );
}
