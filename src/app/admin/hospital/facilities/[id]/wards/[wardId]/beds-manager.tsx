'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import { createBedSchema } from '@/modules/hospital/hospital.schemas';

type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
export interface BedRow {
  id: string;
  label: string;
  status: BedStatus;
}

const STATUS_TONE: Record<BedStatus, 'success' | 'orange' | 'neutral'> = { AVAILABLE: 'success', OCCUPIED: 'orange', MAINTENANCE: 'neutral' };
type FormValues = { label: string };

export function BedsManager({ wardId, initial }: { wardId: string; initial: BedRow[] }) {
  const [beds, setBeds] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleMaintenance(bed: BedRow) {
    setError(null);
    try {
      const nextStatus = bed.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';
      const { bed: updated } = await api.patch<{ bed: BedRow }>(`/api/admin/hospital-beds/${bed.id}`, { status: nextStatus });
      setBeds((prev) => prev.map((b) => (b.id === bed.id ? updated : b)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this bed.');
    }
  }

  return (
    <div className="mt-3 max-w-xl">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {beds.map((b) => (
          <Card key={b.id} className="py-4">
            <p className="font-medium text-brand-neutral-900">{b.label}</p>
            <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
            {b.status !== 'OCCUPIED' && (
              <button type="button" onClick={() => toggleMaintenance(b)} className="mt-2 block text-xs font-medium text-brand-purple-600 hover:underline">
                {b.status === 'MAINTENANCE' ? 'Mark available' : 'Mark maintenance'}
              </button>
            )}
          </Card>
        ))}
        {beds.length === 0 && !showForm && <p className="col-span-full text-sm text-brand-neutral-500">No beds yet.</p>}
      </div>

      {showForm ? (
        <NewBedForm
          wardId={wardId}
          onCreated={(bed) => {
            setBeds((prev) => [bed, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add bed
        </Button>
      )}
    </div>
  );
}

function NewBedForm({ wardId, onCreated, onCancel }: { wardId: string; onCreated: (bed: BedRow) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const dto = createBedSchema.parse(values);
      const { bed } = await api.post<{ bed: BedRow }>(`/api/admin/hospital-wards/${wardId}/beds`, dto);
      onCreated(bed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this bed.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="label">Bed label</Label>
        <Input id="label" placeholder="A-12" {...register('label', { required: true })} />
        <FieldError>{errors.label ? 'Label is required' : undefined}</FieldError>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add bed
        </Button>
      </div>
    </form>
  );
}
