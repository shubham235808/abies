'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label } from '@abies/design-system/components/ui/input';
import type { DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { api, ApiError } from '@abies/design-system/api-client';
import { ConfigManagerShell } from './config-manager-shell';

export interface CourierProviderRow {
  id: string;
  code: string;
  label: string;
  active: boolean;
}

const COLUMNS: DataTableColumn<CourierProviderRow>[] = [
  { key: 'code', label: 'Code', render: (r) => r.code },
  { key: 'label', label: 'Label', render: (r) => r.label },
];

export function CourierProvidersManager({ initial }: { initial: CourierProviderRow[] }) {
  return (
    <ConfigManagerShell
      columns={COLUMNS}
      initialRows={initial}
      apiBase="/api/v1/admin/configuration/courier-providers"
      addModalTitle="Add a courier provider"
      entityLabel="Courier provider"
      deleteConfirmDescription="Existing shipments keep whatever carrier name they already recorded — this only affects what pharmacies can pick for new dispatches."
      renderAddForm={({ onCreated, onCancel }) => <AddForm onCreated={onCreated} onCancel={onCancel} />}
    />
  );
}

function AddForm({ onCreated, onCancel }: { onCreated: (row: CourierProviderRow) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { provider } = await api.post<{ provider: CourierProviderRow }>('/api/v1/admin/configuration/courier-providers', {
        code,
        label,
      });
      onCreated(provider);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this provider.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="cp-code">Code</Label>
        <Input id="cp-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="DELHIVERY" />
      </div>
      <div>
        <Label htmlFor="cp-label">Label</Label>
        <Input id="cp-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Delhivery" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!code || !label} onClick={handleSubmit}>
          Add
        </Button>
      </div>
    </div>
  );
}
