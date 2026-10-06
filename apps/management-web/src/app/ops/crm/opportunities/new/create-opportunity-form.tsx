'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label } from '@abies/design-system/components/ui/input';

export function CreateOpportunityForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();

    const value = text('expectedValue');
    if (!value) {
      setError('Enter the expected value in rupees.');
      return;
    }
    const closeDate = text('expectedCloseAt');
    const payload = {
      title: text('title'),
      service: text('service') || undefined,
      expectedValue: Number(value),
      probability: Number(text('probability') || '50'),
      expectedCloseAt: closeDate ? new Date(closeDate).toISOString() : undefined,
      leadId: text('leadId') || undefined,
    };

    setBusy(true);
    try {
      const res = await fetch('/api/v1/crm/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = Array.isArray(body?.issues) ? body.issues[0]?.message : undefined;
        throw new Error(first ?? body?.error ?? 'Could not create this opportunity.');
      }
      router.push(`/ops/crm/opportunities/${body.opportunity.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this opportunity.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 p-5">
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
        <div className="sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required minLength={2} maxLength={200} placeholder="Panchakarma 21-day package" />
        </div>
        <div>
          <Label htmlFor="service">Service</Label>
          <Input id="service" name="service" maxLength={120} placeholder="Panchakarma" />
        </div>
        <div>
          <Label htmlFor="expectedValue">Expected value (₹)</Label>
          <Input id="expectedValue" name="expectedValue" type="number" inputMode="numeric" min={0} step={1} required placeholder="25000" />
        </div>
        <div>
          <Label htmlFor="probability">Probability (%)</Label>
          <Input id="probability" name="probability" type="number" inputMode="numeric" min={0} max={100} step={1} defaultValue={50} />
        </div>
        <div>
          <Label htmlFor="expectedCloseAt">Expected close date</Label>
          <Input id="expectedCloseAt" name="expectedCloseAt" type="date" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="leadId">Lead ID (optional)</Label>
          <Input id="leadId" name="leadId" placeholder="Paste the lead's ID from the lead page" />
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <Button type="submit" loading={busy}>Create opportunity</Button>
        </div>
      </form>
    </Card>
  );
}
