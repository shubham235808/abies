'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import type { DataTableColumn } from '@/components/ui/data-table';
import { api, ApiError } from '@/lib/api-client';
import { ConfigManagerShell } from './config-manager-shell';

export interface ServiceLocationRow {
  id: string;
  city: string;
  state: string;
  pinCodes: string[];
  active: boolean;
}

const COLUMNS: DataTableColumn<ServiceLocationRow>[] = [
  { key: 'city', label: 'City', render: (r) => r.city },
  { key: 'state', label: 'State', render: (r) => r.state },
  { key: 'pinCodes', label: 'PIN codes', render: (r) => (r.pinCodes.length ? r.pinCodes.join(', ') : '—') },
];

export function LocationsManager({ initial }: { initial: ServiceLocationRow[] }) {
  return (
    <ConfigManagerShell
      columns={COLUMNS}
      initialRows={initial}
      apiBase="/api/admin/configuration/locations"
      addModalTitle="Add a serviceable location"
      entityLabel="Location"
      renderAddForm={({ onCreated, onCancel }) => <AddForm onCreated={onCreated} onCancel={onCancel} />}
    />
  );
}

function AddForm({ onCreated, onCancel }: { onCreated: (row: ServiceLocationRow) => void; onCancel: () => void }) {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCodes, setPinCodes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { location } = await api.post<{ location: ServiceLocationRow }>('/api/admin/configuration/locations', {
        city,
        state,
        pinCodes: pinCodes
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
      });
      onCreated(location);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this location.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="loc-city">City</Label>
        <Input id="loc-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" />
      </div>
      <div>
        <Label htmlFor="loc-state">State</Label>
        <Input id="loc-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" />
      </div>
      <div>
        <Label htmlFor="loc-pins">PIN codes (comma-separated)</Label>
        <Input id="loc-pins" value={pinCodes} onChange={(e) => setPinCodes(e.target.value)} placeholder="411001, 411002" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!city || !state} onClick={handleSubmit}>
          Add
        </Button>
      </div>
    </div>
  );
}
