'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, FieldError } from '@abies/design-system/components/ui/input';
import { Alert } from '@abies/design-system/components/ui/alert';
import { api, ApiError } from '@abies/design-system/api-client';
import { createClinicSchema } from '@abies/domain/modules/doctors/doctors.schemas';
import type { z } from 'zod';

type Clinic = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  active: boolean;
};

type FormValues = z.infer<typeof createClinicSchema>;

export function ClinicsManager({ initial }: { initial: Clinic[] }) {
  const [clinics, setClinics] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createClinicSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { clinic } = await api.post<{ clinic: Clinic }>('/api/doctors/me/clinics', values);
      setClinics((prev) => [...prev, clinic]);
      reset();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add clinic.');
    }
  });

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/doctors/me/clinics/${id}`);
      setClinics((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove clinic.');
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
        {clinics.map((c) => (
          <Card key={c.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-brand-neutral-900">{c.name}</p>
              <p className="text-sm text-brand-neutral-500">
                {c.addressLine1}, {c.city}, {c.state} {c.postalCode}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleRemove(c.id)}>
              Remove
            </Button>
          </Card>
        ))}
        {clinics.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No clinics added yet.</p>}
      </div>

      {showForm ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Clinic name</Label>
              <Input id="name" {...register('name')} />
              <FieldError>{errors.name?.message}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="addressLine1">Address</Label>
              <Input id="addressLine1" {...register('addressLine1')} />
              <FieldError>{errors.addressLine1?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register('city')} />
              <FieldError>{errors.city?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" {...register('state')} />
              <FieldError>{errors.state?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="postalCode">Postal code</Label>
              <Input id="postalCode" {...register('postalCode')} />
              <FieldError>{errors.postalCode?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" {...register('phone')} />
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Add clinic
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add clinic
        </Button>
      )}
    </div>
  );
}
