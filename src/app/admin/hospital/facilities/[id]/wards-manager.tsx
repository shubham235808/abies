'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import { createWardSchema } from '@/modules/hospital/hospital.schemas';

export interface WardRow {
  id: string;
  name: string;
  wardType: string;
  active: boolean;
  _count: { beds: number };
}

type FormValues = { name: string; wardType: string };

export function WardsManager({ facilityId, initial }: { facilityId: string; initial: WardRow[] }) {
  const [wards, setWards] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(ward: WardRow) {
    setError(null);
    try {
      const { ward: updated } = await api.patch<{ ward: WardRow }>(`/api/admin/hospital-wards/${ward.id}`, { active: !ward.active });
      setWards((prev) => prev.map((w) => (w.id === ward.id ? { ...w, ...updated } : w)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this ward.');
    }
  }

  return (
    <div className="mt-3 max-w-2xl">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {wards.map((w) => (
          <Card key={w.id} className="flex items-center justify-between py-4">
            <div>
              <Link href={`/admin/hospital/facilities/${facilityId}/wards/${w.id}`} className="font-medium text-brand-neutral-900 hover:underline">
                {w.name}
              </Link>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={w.active ? 'success' : 'neutral'}>{w.active ? 'Active' : 'Inactive'}</Badge>
                <span className="text-xs text-brand-neutral-500">
                  {w.wardType} · {w._count.beds} bed{w._count.beds !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/hospital/facilities/${facilityId}/wards/${w.id}`}>
                <Button variant="secondary" size="sm">
                  Beds
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => toggleActive(w)}>
                {w.active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </Card>
        ))}
        {wards.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No wards yet.</p>}
      </div>

      {showForm ? (
        <NewWardForm
          facilityId={facilityId}
          onCreated={(ward) => {
            setWards((prev) => [{ ...ward, _count: { beds: 0 } }, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add ward
        </Button>
      )}
    </div>
  );
}

function NewWardForm({ facilityId, onCreated, onCancel }: { facilityId: string; onCreated: (ward: Omit<WardRow, '_count'>) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const dto = createWardSchema.parse(values);
      const { ward } = await api.post<{ ward: Omit<WardRow, '_count'> }>(`/api/admin/hospital-facilities/${facilityId}/wards`, dto);
      onCreated(ward);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this ward.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Ward name</Label>
        <Input id="name" placeholder="General Ward A" {...register('name', { required: true })} />
        <FieldError>{errors.name ? 'Name is required' : undefined}</FieldError>
      </div>
      <div>
        <Label htmlFor="wardType">Ward type</Label>
        <Input id="wardType" placeholder="General / ICU / Panchakarma Inpatient" {...register('wardType', { required: true })} />
        <FieldError>{errors.wardType ? 'Ward type is required' : undefined}</FieldError>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add ward
        </Button>
      </div>
    </form>
  );
}
