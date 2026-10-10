'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FieldError, Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import { adminCreateTestSchema, updateTestSchema } from '@abies/domain/modules/diagnostics/catalogue.schemas';

type Lab = { id: string; name: string | null };
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
  lab: Lab;
};

// A raw DiagnosticTest row as the API returns it — no `lab` relation, since
// createTestForLab/updateTestById don't include it (the admin UI already
// knows which lab it's acting on from the picker, so it attaches that
// client-side rather than paying for an extra join on every write).
type TestRow = Omit<Test, 'lab'>;

type CreateFormValues = z.infer<typeof adminCreateTestSchema>;
type EditFormValues = z.infer<typeof updateTestSchema>;

export function TestsManager({ labs, initial }: { labs: Lab[]; initial: Test[] }) {
  const [tests, setTests] = useState(initial);
  const [modal, setModal] = useState<'create' | { edit: Test } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(test: Test) {
    setError(null);
    try {
      const { test: updated } = await api.patch<{ test: TestRow }>(`/api/v1/admin/diagnostics/tests/${test.id}`, { active: !test.active });
      setTests((prev) => prev.map((t) => (t.id === test.id ? { ...t, ...updated } : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this test.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/diagnostics/tests/${id}`);
      setTests((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this test.');
    }
  }

  return (
    <div className="max-w-3xl">
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
                <span className="text-xs text-brand-neutral-400">· {t.lab.name ?? 'Unnamed lab'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setModal({ edit: t })}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                {t.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleRemove(t.id)}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {tests.length === 0 && <p className="text-sm text-brand-neutral-500">No tests yet.</p>}
      </div>

      {labs.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">Approve a lab under Verification Centre before adding tests for it.</p>
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setModal('create')}>
          + Add test
        </Button>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'New test' : 'Edit test'}>
        {modal === 'create' && (
          <CreateTestForm
            labs={labs}
            onCreated={(test) => {
              setTests((prev) => [test, ...prev]);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
        {modal !== null && modal !== 'create' && (
          <EditTestForm
            test={modal.edit}
            onSaved={(test) => {
              setTests((prev) => prev.map((t) => (t.id === test.id ? test : t)));
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function CreateTestForm({ labs, onCreated, onCancel }: { labs: Lab[]; onCreated: (test: Test) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({ resolver: zodResolver(adminCreateTestSchema), defaultValues: { labId: labs[0]?.id } });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { test } = await api.post<{ test: TestRow }>('/api/v1/admin/diagnostics/tests', values);
      const lab = labs.find((l) => l.id === values.labId) ?? { id: values.labId, name: null };
      onCreated({ ...test, lab });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this test.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="labId">Lab</Label>
        <Select id="labId" {...register('labId')}>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name ?? l.id}
            </option>
          ))}
        </Select>
        <FieldError>{errors.labId?.message}</FieldError>
      </div>
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
      <div className="flex justify-end gap-3">
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

function EditTestForm({ test, onSaved, onCancel }: { test: Test; onSaved: (test: Test) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(updateTestSchema),
    defaultValues: {
      code: test.code,
      name: test.name,
      description: test.description ?? undefined,
      sampleType: test.sampleType ?? undefined,
      preparationInstructions: test.preparationInstructions ?? undefined,
      price: test.price,
      turnaroundHours: test.turnaroundHours ?? undefined,
      active: test.active,
    },
  });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { test: updated } = await api.patch<{ test: TestRow }>(`/api/v1/admin/diagnostics/tests/${test.id}`, values);
      onSaved({ ...test, ...updated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this test.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-brand-neutral-500">Lab: {test.lab.name ?? test.lab.id} (fixed — remove and re-add under a different lab if this was wrong)</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-code">Code</Label>
          <Input id="edit-code" {...register('code')} />
          <FieldError>{errors.code?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" {...register('name')} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="edit-price">Price (₹)</Label>
          <Input id="edit-price" inputMode="numeric" {...register('price', { valueAsNumber: true })} />
          <FieldError>{errors.price?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="edit-turnaroundHours">Turnaround (hours)</Label>
          <Input
            id="edit-turnaroundHours"
            inputMode="numeric"
            {...register('turnaroundHours', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
          />
        </div>
        <div>
          <Label htmlFor="edit-sampleType">Sample type</Label>
          <Input id="edit-sampleType" {...register('sampleType')} />
        </div>
      </div>
      <div>
        <Label htmlFor="edit-description">Description</Label>
        <Textarea id="edit-description" rows={2} {...register('description')} />
      </div>
      <div>
        <Label htmlFor="edit-preparationInstructions">Preparation instructions</Label>
        <Textarea id="edit-preparationInstructions" rows={2} {...register('preparationInstructions')} />
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" {...register('active')} />
        Active
      </label>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
