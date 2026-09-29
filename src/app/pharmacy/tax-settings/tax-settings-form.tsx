'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';

type TaxSettings = {
  legalBusinessName: string;
  gstin: string;
  registeredState: string;
  stateCode: string;
  invoicePrefix: string;
};

export function TaxSettingsForm({ initial }: { initial: TaxSettings | null }) {
  const [legalBusinessName, setLegalBusinessName] = useState(initial?.legalBusinessName ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');
  const [registeredState, setRegisteredState] = useState(initial?.registeredState ?? '');
  const [stateCode, setStateCode] = useState(initial?.stateCode ?? '');
  const [invoicePrefix, setInvoicePrefix] = useState(initial?.invoicePrefix ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.put('/api/pharmacies/me/tax-settings', {
        legalBusinessName,
        gstin: gstin.toUpperCase(),
        registeredState,
        stateCode,
        invoicePrefix: invoicePrefix.toUpperCase(),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save tax settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Saved.</Alert>}
      <div>
        <Label htmlFor="ts-name">Legal business name</Label>
        <Input id="ts-name" value={legalBusinessName} onChange={(e) => setLegalBusinessName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="ts-gstin">GSTIN</Label>
        <Input id="ts-gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27AAAAA0000A1Z5" maxLength={15} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ts-state">Registered state</Label>
          <Input id="ts-state" value={registeredState} onChange={(e) => setRegisteredState(e.target.value)} placeholder="Maharashtra" />
        </div>
        <div>
          <Label htmlFor="ts-state-code">State code</Label>
          <Input id="ts-state-code" value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="27" maxLength={4} />
        </div>
      </div>
      <div>
        <Label htmlFor="ts-prefix">Invoice prefix</Label>
        <Input id="ts-prefix" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} placeholder="INV" />
        <p className="mt-1 text-xs text-brand-neutral-400">Invoices are numbered {invoicePrefix || 'PREFIX'}-000001, {invoicePrefix || 'PREFIX'}-000002, …</p>
      </div>
      <Button loading={busy} onClick={handleSubmit}>
        Save
      </Button>
    </div>
  );
}
