'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label } from '@abies/design-system/components/ui/input';
import type { DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { api, ApiError } from '@abies/design-system/api-client';
import { ConfigManagerShell } from './config-manager-shell';

export interface ConfigCategoryRow {
  id: string;
  domain: string;
  key: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

const COLUMNS: DataTableColumn<ConfigCategoryRow>[] = [
  { key: 'domain', label: 'Domain', render: (r) => r.domain },
  { key: 'key', label: 'Key', render: (r) => r.key },
  { key: 'label', label: 'Label', render: (r) => r.label },
  { key: 'sortOrder', label: 'Order', align: 'right', render: (r) => r.sortOrder },
];

export function CategoriesManager({ initial }: { initial: ConfigCategoryRow[] }) {
  return (
    <ConfigManagerShell
      columns={COLUMNS}
      initialRows={initial}
      apiBase="/api/v1/admin/configuration/categories"
      addModalTitle="Add a category entry"
      entityLabel="Category"
      deleteConfirmDescription="Anything already using this key keeps working — new selections just won't offer it anymore."
      renderAddForm={({ onCreated, onCancel }) => <AddForm onCreated={onCreated} onCancel={onCancel} />}
    />
  );
}

function AddForm({ onCreated, onCancel }: { onCreated: (row: ConfigCategoryRow) => void; onCancel: () => void }) {
  const [domain, setDomain] = useState('');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { category } = await api.post<{ category: ConfigCategoryRow }>('/api/v1/admin/configuration/categories', {
        domain,
        key,
        label,
      });
      onCreated(category);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-brand-neutral-500">
        Domain groups related entries — e.g. SPECIALTY, MEDICINE_CATEGORY, DIAGNOSTIC_CATEGORY, SUPPORT_CATEGORY.
      </p>
      <div>
        <Label htmlFor="cc-domain">Domain</Label>
        <Input id="cc-domain" value={domain} onChange={(e) => setDomain(e.target.value.toUpperCase())} placeholder="SPECIALTY" />
      </div>
      <div>
        <Label htmlFor="cc-key">Key</Label>
        <Input id="cc-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="panchakarma" />
      </div>
      <div>
        <Label htmlFor="cc-label">Label</Label>
        <Input id="cc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Panchakarma" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!domain || !key || !label} onClick={handleSubmit}>
          Add
        </Button>
      </div>
    </div>
  );
}
