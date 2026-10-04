'use client';

import { useMemo, useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';
import type { DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { api, ApiError } from '@abies/design-system/api-client';
import { ConfigManagerShell } from '../configuration/config-manager-shell';

type PartnerKind = 'DOCTOR' | 'DIAGNOSTIC_LAB' | 'PHARMACY' | 'PANCHAKARMA_CENTRE';
const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  DOCTOR: 'Doctor',
  DIAGNOSTIC_LAB: 'Diagnostic lab',
  PHARMACY: 'Pharmacy',
  PANCHAKARMA_CENTRE: 'Panchakarma centre',
};

export interface FeeTermRow {
  id: string;
  partnerKind: PartnerKind;
  partnerId: string;
  feeModel: 'PERCENTAGE' | 'FIXED';
  rateBasisPoints: number | null;
  fixedAmount: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
}

export type PartnerOptions = Record<PartnerKind, { id: string; name: string }[]>;

const COLUMNS = (partnerNames: Map<string, string>): DataTableColumn<FeeTermRow>[] => [
  { key: 'partnerKind', label: 'Partner type', render: (r) => PARTNER_KIND_LABEL[r.partnerKind] },
  { key: 'partner', label: 'Partner', render: (r) => partnerNames.get(r.partnerId) ?? r.partnerId },
  {
    key: 'fee',
    label: 'Fee',
    render: (r) => (r.feeModel === 'PERCENTAGE' ? `${((r.rateBasisPoints ?? 0) / 100).toFixed(2)}%` : `₹${r.fixedAmount ?? 0} flat`),
  },
  {
    key: 'effective',
    label: 'Effective',
    render: (r) => `${new Date(r.effectiveFrom).toLocaleDateString('en-IN')} – ${r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString('en-IN') : 'ongoing'}`,
  },
];

export function FeeTermsManager({ initial, partnerOptions }: { initial: FeeTermRow[]; partnerOptions: PartnerOptions }) {
  const partnerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of Object.values(partnerOptions)) for (const p of list) map.set(p.id, p.name);
    return map;
  }, [partnerOptions]);

  return (
    <ConfigManagerShell
      columns={COLUMNS(partnerNames)}
      initialRows={initial}
      apiBase="/api/v1/admin/settlement/fee-terms"
      addModalTitle="Add a partner fee term"
      entityLabel="Fee term"
      deleteConfirmDescription="Commissions already computed keep the numbers they were recorded with — this only removes the term from future use."
      renderAddForm={({ onCreated, onCancel }) => <AddForm partnerOptions={partnerOptions} onCreated={onCreated} onCancel={onCancel} />}
    />
  );
}

function AddForm({
  partnerOptions,
  onCreated,
  onCancel,
}: {
  partnerOptions: PartnerOptions;
  onCreated: (row: FeeTermRow) => void;
  onCancel: () => void;
}) {
  const [partnerKind, setPartnerKind] = useState<PartnerKind>('DOCTOR');
  const [partnerId, setPartnerId] = useState('');
  const [feeModel, setFeeModel] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [ratePercent, setRatePercent] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = partnerOptions[partnerKind];

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { feeTerm } = await api.post<{ feeTerm: FeeTermRow }>('/api/v1/admin/settlement/fee-terms', {
        partnerKind,
        partnerId,
        feeModel,
        rateBasisPoints: feeModel === 'PERCENTAGE' ? Math.round(Number(ratePercent) * 100) : undefined,
        fixedAmount: feeModel === 'FIXED' ? Number(fixedAmount) : undefined,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : undefined,
      });
      onCreated(feeTerm);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this fee term.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="ft-kind">Partner type</Label>
        <Select
          id="ft-kind"
          value={partnerKind}
          onChange={(e) => {
            setPartnerKind(e.target.value as PartnerKind);
            setPartnerId('');
          }}
        >
          {Object.entries(PARTNER_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="ft-partner">Partner</Label>
        <Select id="ft-partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        {options.length === 0 && <p className="mt-1 text-xs text-brand-neutral-400">No approved {PARTNER_KIND_LABEL[partnerKind].toLowerCase()}s yet.</p>}
      </div>
      <div>
        <Label htmlFor="ft-model">Fee model</Label>
        <Select id="ft-model" value={feeModel} onChange={(e) => setFeeModel(e.target.value as 'PERCENTAGE' | 'FIXED')}>
          <option value="PERCENTAGE">Percentage of payment</option>
          <option value="FIXED">Fixed amount per transaction</option>
        </Select>
      </div>
      {feeModel === 'PERCENTAGE' ? (
        <div>
          <Label htmlFor="ft-rate">Rate (%)</Label>
          <Input id="ft-rate" inputMode="decimal" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} placeholder="15" />
        </div>
      ) : (
        <div>
          <Label htmlFor="ft-fixed">Fixed amount (₹)</Label>
          <Input id="ft-fixed" inputMode="numeric" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} placeholder="50" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ft-from">Effective from</Label>
          <Input id="ft-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ft-to">Effective to (optional)</Label>
          <Input id="ft-to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={!partnerId || (feeModel === 'PERCENTAGE' ? !ratePercent : !fixedAmount)}
          onClick={handleSubmit}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
