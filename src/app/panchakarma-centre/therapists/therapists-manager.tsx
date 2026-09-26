'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import { createTherapistSchema } from '@/modules/panchakarma/catalogue.schemas';

type Therapist = { id: string; name: string; qualifications: string | null; active: boolean };
type FormValues = z.infer<typeof createTherapistSchema>;

export function TherapistsManager({ initial }: { initial: Therapist[] }) {
  const [therapists, setTherapists] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(therapist: Therapist) {
    setError(null);
    try {
      const { therapist: updated } = await api.patch<{ therapist: Therapist }>(
        `/api/panchakarma-centres/me/therapists/${therapist.id}`,
        { active: !therapist.active },
      );
      setTherapists((prev) => prev.map((t) => (t.id === therapist.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this therapist.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/panchakarma-centres/me/therapists/${id}`);
      setTherapists((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this therapist.');
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
        {therapists.map((t) => (
          <Card key={t.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-brand-neutral-900">{t.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                {t.qualifications && <span className="text-xs text-brand-neutral-500">{t.qualifications}</span>}
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
        {therapists.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No therapists yet.</p>}
      </div>

      {showForm ? (
        <NewTherapistForm
          onCreated={(therapist) => {
            setTherapists((prev) => [therapist, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add therapist
        </Button>
      )}
    </div>
  );
}

function NewTherapistForm({ onCreated, onCancel }: { onCreated: (therapist: Therapist) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createTherapistSchema) });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { therapist } = await api.post<{ therapist: Therapist }>('/api/panchakarma-centres/me/therapists', values);
      onCreated(therapist);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this therapist.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register('name')} />
        <FieldError>{errors.name?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="qualifications">Qualifications</Label>
        <Input id="qualifications" placeholder="e.g. BAMS, certified Panchakarma therapist" {...register('qualifications')} />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add therapist
        </Button>
      </div>
    </form>
  );
}
