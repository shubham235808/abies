'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { DataTable, type DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { api, ApiError } from '@abies/design-system/api-client';

export interface SettlementRow {
  id: string;
  cycleStart: string;
  cycleEnd: string;
  status: 'OPEN' | 'LOCKED' | 'COMPLETED';
  payouts: { id: string; status: string; totalAmount: number }[];
}

const STATUS_TONE: Record<SettlementRow['status'], string> = {
  OPEN: 'bg-brand-blue-50 text-brand-blue-700',
  LOCKED: 'bg-brand-orange-50 text-brand-orange-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
};

export function SettlementCyclesManager({ initial }: { initial: SettlementRow[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);

  const columns: DataTableColumn<SettlementRow>[] = [
    {
      key: 'cycle',
      label: 'Cycle',
      render: (r) => (
        <Link href={`/ops/admin/settlement/cycles/${r.id}`} className="font-medium text-brand-purple-600 hover:underline">
          {new Date(r.cycleStart).toLocaleDateString('en-IN')} – {new Date(r.cycleEnd).toLocaleDateString('en-IN')}
        </Link>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>{r.status}</span>,
    },
    { key: 'payouts', label: 'Payouts', render: (r) => r.payouts.length },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (r) => `₹${r.payouts.reduce((sum, p) => sum + p.totalAmount, 0).toLocaleString('en-IN')}`,
    },
  ];

  return (
    <div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          + New cycle
        </Button>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage="No settlement cycles yet." />

      <Modal open={open} onClose={() => setOpen(false)} title="Start a settlement cycle">
        <NewCycleForm
          onCreated={(row) => {
            setRows((prev) => [row, ...prev]);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </div>
  );
}

function NewCycleForm({ onCreated, onCancel }: { onCreated: (row: SettlementRow) => void; onCancel: () => void }) {
  const [cycleStart, setCycleStart] = useState('');
  const [cycleEnd, setCycleEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { settlement } = await api.post<{ settlement: SettlementRow }>('/api/v1/admin/settlement/settlements', {
        cycleStart: new Date(`${cycleStart}T00:00:00.000Z`).toISOString(),
        // End-of-day on the selected end date — a date picker's "end" is
        // the last day to include, not midnight at its start.
        cycleEnd: new Date(`${cycleEnd}T23:59:59.999Z`).toISOString(),
      });
      onCreated({ ...settlement, payouts: [] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start this cycle.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-brand-neutral-600">
        Every commission recorded inside this window becomes eligible for a payout once the cycle is locked.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cycle-start">Cycle start</Label>
          <Input id="cycle-start" type="date" value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cycle-end">Cycle end</Label>
          <Input id="cycle-end" type="date" value={cycleEnd} onChange={(e) => setCycleEnd(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!cycleStart || !cycleEnd} onClick={handleSubmit}>
          Start cycle
        </Button>
      </div>
    </div>
  );
}
