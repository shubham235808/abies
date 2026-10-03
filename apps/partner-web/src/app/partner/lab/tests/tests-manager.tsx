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
import { createTestSchema } from '@abies/domain/modules/diagnostics/catalogue.schemas';

type Test = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sampleType: string | null;
  preparationInstructions: string | null;
  price: number;
  turnaroundHours: number | null;
  active: boolean;
};

type FormValues = z.infer<typeof createTestSchema>;

export function TestsManager({ initial }: { initial: Test[] }) {
  const [tests, setTests] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(test: Test) {
    setError(null);
    try {
      const { test: updated } = await api.patch<{ test: Test }>(`/api/labs/me/tests/${test.id}`, { active: !test.active });
      setTests((prev) => prev.map((t) => (t.id === test.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this test.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/labs/me/tests/${id}`);
      setTests((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this test.');
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
        {tests.map((t) => (
          <Card key={t.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-brand-neutral-900">
                {t.name} <span className="text-xs text-brand-neutral-400">({t.code})</span>
              </p>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                <span className="text-xs text-brand-neutral-500">₹{t.price}</span>
                {t.turnaroundHours && <span className="text-xs text-brand-neutral-400">{t.turnaroundHours}h turnaround</span>}
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
        {tests.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No tests yet.</p>}
      </div>

      {showForm ? (
        <NewTestForm
          onCreated={(test) => {
            setTests((prev) => [test, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add test
        </Button>
      )}
    </div>
  );
}

function NewTestForm({ onCreated, onCancel }: { onCreated: (test: Test) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createTestSchema) });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { test } = await api.post<{ test: Test }>('/api/labs/me/tests', values);
      onCreated(test);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this test.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="code">Code</Label>
          <Input id="code" placeholder="e.g. CBC" {...register('code')} />
          <FieldError>{errors.code?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="e.g. Complete Blood Count" {...register('name')} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="price">Price (₹)</Label>
          <Input id="price" inputMode="numeric" {...register('price', { valueAsNumber: true })} />
          <FieldError>{errors.price?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="turnaroundHours">Turnaround (hours)</Label>
          <Input id="turnaroundHours" inputMode="numeric" {...register('turnaroundHours', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })} />
        </div>
        <div>
          <Label htmlFor="sampleType">Sample type</Label>
          <Input id="sampleType" placeholder="e.g. Venous blood" {...register('sampleType')} />
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={2} {...register('description')} />
      </div>
      <div>
        <Label htmlFor="preparationInstructions">Preparation instructions</Label>
        <Textarea id="preparationInstructions" rows={2} placeholder="e.g. 8-10 hours fasting required" {...register('preparationInstructions')} />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add test
        </Button>
      </div>
    </form>
  );
}
