'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FieldError, Input, Label } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';
import { createFacilitySchema } from '@abies/domain/modules/hospital/hospital.schemas';

export interface FacilityRow {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  active: boolean;
  _count: { wards: number };
}

type FormValues = { name: string; addressLine1: string; addressLine2?: string; city: string; state: string; postalCode: string };

export function FacilitiesManager({ initial }: { initial: FacilityRow[] }) {
  const [facilities, setFacilities] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(facility: FacilityRow) {
    setError(null);
    try {
      const { facility: updated } = await api.patch<{ facility: FacilityRow }>(`/api/v1/admin/hospital-facilities/${facility.id}`, { active: !facility.active });
      setFacilities((prev) => prev.map((f) => (f.id === facility.id ? { ...f, ...updated } : f)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this facility.');
    }
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {facilities.map((f) => (
          <Card key={f.id} className="flex items-center justify-between py-4">
            <div>
              <Link href={`/ops/admin/hospital/facilities/${f.id}`} className="font-medium text-brand-neutral-900 hover:underline">
                {f.name}
              </Link>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={f.active ? 'success' : 'neutral'}>{f.active ? 'Active' : 'Inactive'}</Badge>
                <span className="text-xs text-brand-neutral-500">
                  {f.city}, {f.state} · {f._count.wards} ward{f._count.wards !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/ops/admin/hospital/facilities/${f.id}`}>
                <Button variant="secondary" size="sm">
                  Wards
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => toggleActive(f)}>
                {f.active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </Card>
        ))}
        {facilities.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No facilities yet.</p>}
      </div>

      {showForm ? (
        <NewFacilityForm
          onCreated={(facility) => {
            setFacilities((prev) => [{ ...facility, _count: { wards: 0 } }, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add facility
        </Button>
      )}
    </div>
  );
}

function NewFacilityForm({ onCreated, onCancel }: { onCreated: (facility: Omit<FacilityRow, '_count'>) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const dto = createFacilitySchema.parse({ ...values, addressLine2: values.addressLine2 || undefined });
      const { facility } = await api.post<{ facility: Omit<FacilityRow, '_count'> }>('/api/v1/admin/hospital-facilities', dto);
      onCreated(facility);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this facility.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Facility name</Label>
        <Input id="name" {...register('name', { required: true })} />
        <FieldError>{errors.name ? 'Name is required' : undefined}</FieldError>
      </div>
      <div>
        <Label htmlFor="addressLine1">Address line 1</Label>
        <Input id="addressLine1" {...register('addressLine1', { required: true })} />
        <FieldError>{errors.addressLine1 ? 'Address is required' : undefined}</FieldError>
      </div>
      <div>
        <Label htmlFor="addressLine2">Address line 2 (optional)</Label>
        <Input id="addressLine2" {...register('addressLine2')} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register('city', { required: true })} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" {...register('state', { required: true })} />
        </div>
        <div>
          <Label htmlFor="postalCode">Postal code</Label>
          <Input id="postalCode" {...register('postalCode', { required: true })} />
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add facility
        </Button>
      </div>
    </form>
  );
}
