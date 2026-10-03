'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label } from '@abies/design-system/components/ui/input';
import type { DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { api, ApiError } from '@abies/design-system/api-client';
import { ConfigManagerShell } from './config-manager-shell';

export interface GstRateRow {
  id: string;
  hsnCode: string;
  label: string;
  ratePercent: number;
  active: boolean;
}

const COLUMNS: DataTableColumn<GstRateRow>[] = [
  { key: 'hsnCode', label: 'HSN code', render: (r) => r.hsnCode },
  { key: 'label', label: 'Description', render: (r) => r.label },
  { key: 'ratePercent', label: 'Rate', render: (r) => `${r.ratePercent}%` },
];

export function GstRatesManager({ initial }: { initial: GstRateRow[] }) {
  return (
    <ConfigManagerShell
      columns={COLUMNS}
      initialRows={initial}
      apiBase="/api/admin/configuration/gst-rates"
      addModalTitle="Add a GST rate"
      entityLabel="GST rate"
      deleteConfirmDescription="Sales already recorded keep the rate that applied at the time — this only removes it from future use."
      renderAddForm={({ onCreated, onCancel }) => <AddForm onCreated={onCreated} onCancel={onCancel} />}
    />
  );
}

function AddForm({ onCreated, onCancel }: { onCreated: (row: GstRateRow) => void; onCancel: () => void }) {
  const [hsnCode, setHsnCode] = useState('');
  const [label, setLabel] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { rate } = await api.post<{ rate: GstRateRow }>('/api/admin/configuration/gst-rates', {
        hsnCode,
        label,
        ratePercent: Number(ratePercent),
      });
      onCreated(rate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this GST rate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="gst-hsn">HSN code</Label>
        <Input id="gst-hsn" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="3004" />
      </div>
      <div>
        <Label htmlFor="gst-label">Description</Label>
        <Input id="gst-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ayurvedic medicaments" />
      </div>
      <div>
        <Label htmlFor="gst-rate">Rate (%)</Label>
        <Input id="gst-rate" inputMode="numeric" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} placeholder="12" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!hsnCode || !label || !ratePercent} onClick={handleSubmit}>
          Add
        </Button>
      </div>
    </div>
  );
}
