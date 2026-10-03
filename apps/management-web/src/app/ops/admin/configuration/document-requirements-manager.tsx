'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';
import type { DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { api, ApiError } from '@abies/design-system/api-client';
import { ConfigManagerShell } from './config-manager-shell';

export interface DocumentRequirementRow {
  id: string;
  partnerType: string;
  documentType: string;
  required: boolean;
  active: boolean;
}

const PARTNER_TYPES = ['DOCTOR', 'LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE', 'THERAPIST'];

const COLUMNS: DataTableColumn<DocumentRequirementRow>[] = [
  { key: 'partnerType', label: 'Partner type', render: (r) => r.partnerType },
  { key: 'documentType', label: 'Document type', render: (r) => r.documentType },
  { key: 'required', label: 'Required', render: (r) => (r.required ? 'Yes' : 'No') },
];

export function DocumentRequirementsManager({ initial }: { initial: DocumentRequirementRow[] }) {
  return (
    <ConfigManagerShell
      columns={COLUMNS}
      initialRows={initial}
      apiBase="/api/admin/configuration/document-requirements"
      addModalTitle="Add a document requirement"
      entityLabel="Requirement"
      renderAddForm={({ onCreated, onCancel }) => <AddForm onCreated={onCreated} onCancel={onCancel} />}
    />
  );
}

function AddForm({ onCreated, onCancel }: { onCreated: (row: DocumentRequirementRow) => void; onCancel: () => void }) {
  const [partnerType, setPartnerType] = useState(PARTNER_TYPES[0]!);
  const [documentType, setDocumentType] = useState('');
  const [required, setRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { requirement } = await api.post<{ requirement: DocumentRequirementRow }>(
        '/api/admin/configuration/document-requirements',
        { partnerType, documentType, required },
      );
      onCreated(requirement);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this requirement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="dr-partner">Partner type</Label>
        <Select id="dr-partner" value={partnerType} onChange={(e) => setPartnerType(e.target.value)}>
          {PARTNER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="dr-doctype">Document type</Label>
        <Input id="dr-doctype" value={documentType} onChange={(e) => setDocumentType(e.target.value.toUpperCase())} placeholder="ID_PROOF" />
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required for verification
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!documentType} onClick={handleSubmit}>
          Add
        </Button>
      </div>
    </div>
  );
}
