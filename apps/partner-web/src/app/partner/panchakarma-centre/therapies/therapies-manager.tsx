'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FieldError, Input, Label, Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';
import { createTherapySchema } from '@abies/domain/modules/panchakarma/catalogue.schemas';

type Therapy = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  contraindications: string | null;
  price: number;
  requiredSupervision: boolean;
  active: boolean;
};

type FormValues = z.infer<typeof createTherapySchema>;

export function TherapiesManager({ initial }: { initial: Therapy[] }) {
  const [therapies, setTherapies] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(therapy: Therapy) {
    setError(null);
    try {
      const { therapy: updated } = await api.patch<{ therapy: Therapy }>(`/api/v1/panchakarma-centres/me/therapies/${therapy.id}`, {
        active: !therapy.active,
      });
      setTherapies((prev) => prev.map((t) => (t.id === therapy.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this therapy.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/v1/panchakarma-centres/me/therapies/${id}`);
      setTherapies((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this therapy.');
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
        {therapies.map((t) => (
          <Card key={t.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-brand-neutral-900">{t.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                <span className="text-xs text-brand-neutral-500">₹{t.price}</span>
                {t.durationMinutes && <span className="text-xs text-brand-neutral-400">{t.durationMinutes} min</span>}
                {t.requiredSupervision && <Badge tone="orange">Supervised</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                {t.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleRemove(t.id)}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {therapies.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No therapies yet.</p>}
      </div>

      {showForm ? (
        <NewTherapyForm
          onCreated={(therapy) => {
            setTherapies((prev) => [therapy, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add therapy
        </Button>
      )}
    </div>
  );
}

function NewTherapyForm({ onCreated, onCancel }: { onCreated: (therapy: Therapy) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createTherapySchema) });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { therapy } = await api.post<{ therapy: Therapy }>('/api/v1/panchakarma-centres/me/therapies', values);
      onCreated(therapy);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this therapy.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="e.g. Abhyanga" {...register('name')} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="price">Price per session (₹)</Label>
          <Input id="price" inputMode="numeric" {...register('price', { valueAsNumber: true })} />
          <FieldError>{errors.price?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
          <Input id="durationMinutes" inputMode="numeric" {...register('durationMinutes', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })} />
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={2} {...register('description')} />
      </div>
      <div>
        <Label htmlFor="prerequisites">Prerequisites</Label>
        <Textarea id="prerequisites" rows={2} placeholder="e.g. Fasting not required" {...register('prerequisites')} />
      </div>
      <div>
        <Label htmlFor="contraindications">Contraindications</Label>
        <Textarea id="contraindications" rows={2} placeholder="e.g. Not for pregnant patients" {...register('contraindications')} />
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" {...register('requiredSupervision')} />
        Requires supervising practitioner present
      </label>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add therapy
        </Button>
      </div>
    </form>
  );
}
