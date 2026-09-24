'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { CarePlanItemStatusBadge, CarePlanStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
import {
  createCarePlanItemSchema,
  updateCarePlanDetailsSchema,
  updateCarePlanItemSchema,
} from '@/modules/care-plans/care-plans.schemas';

type DetailsForm = z.infer<typeof updateCarePlanDetailsSchema>;
type ItemForm = z.infer<typeof createCarePlanItemSchema>;

type CarePlanStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'SUPERSEDED';
type ItemStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
type ItemType = 'CONSULTATION' | 'DIAGNOSTIC' | 'MEDICINE' | 'PANCHAKARMA' | 'LIFESTYLE' | 'DIET' | 'FOLLOW_UP' | 'TASK' | 'MILESTONE';

type Item = {
  id: string;
  type: ItemType;
  title: string;
  description: string | null;
  status: ItemStatus;
  dueDate: string | null;
  completedDate: string | null;
  patientMarkedDoneAt: string | null;
  notes: string | null;
};

type Plan = {
  id: string;
  status: CarePlanStatus;
  startDate: string;
  targetDate: string | null;
  summary: string | null;
  goals: string[];
  patientName: string;
  careRecipientName: string | null;
  items: Item[];
};

const TRANSITIONS: Record<CarePlanStatus, CarePlanStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED', 'SUPERSEDED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

const ITEM_TYPES: ItemType[] = ['CONSULTATION', 'DIAGNOSTIC', 'MEDICINE', 'PANCHAKARMA', 'LIFESTYLE', 'DIET', 'FOLLOW_UP', 'TASK', 'MILESTONE'];
const ITEM_STATUSES: ItemStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'MISSED', 'CANCELLED'];

const EDITABLE = new Set<CarePlanStatus>(['DRAFT', 'ACTIVE', 'PAUSED']);

export function CarePlanWorkspace({ plan: initial }: { plan: Plan }) {
  const [plan, setPlan] = useState(initial);
  const [items, setItems] = useState(initial.items);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<CarePlanStatus | null>(null);
  const editable = EDITABLE.has(plan.status);

  async function handleTransition(status: CarePlanStatus) {
    setTransitioning(status);
    setError(null);
    try {
      const { carePlan } = await api.post<{ carePlan: { status: CarePlanStatus } }>(`/api/care-plans/${plan.id}/transition`, { status });
      setPlan((p) => ({ ...p, status: carePlan.status }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this care plan.');
    } finally {
      setTransitioning(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">
            Care plan — {plan.patientName}
            {plan.careRecipientName && ` (for ${plan.careRecipientName})`}
          </h1>
          <p className="mt-1 text-sm text-brand-neutral-600">
            Started {new Date(plan.startDate).toLocaleDateString()}
            {plan.targetDate && ` · Target ${new Date(plan.targetDate).toLocaleDateString()}`}
          </p>
        </div>
        <CarePlanStatusBadge status={plan.status} />
      </div>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      {TRANSITIONS[plan.status].length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {TRANSITIONS[plan.status].map((s) => (
            <Button key={s} variant="secondary" size="sm" loading={transitioning === s} onClick={() => handleTransition(s)}>
              {s === 'ACTIVE' && plan.status === 'DRAFT' ? 'Share with patient (activate)' : s.charAt(0) + s.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Plan details</h2>
        <DetailsForm plan={plan} editable={editable} onSaved={(p) => setPlan((prev) => ({ ...prev, ...p }))} />
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Items</h2>
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} editable={editable} onSaved={(u) => setItems((prev) => prev.map((i) => (i.id === u.id ? u : i)))} />
          ))}
          {items.length === 0 && <p className="text-sm text-brand-neutral-500">No items yet.</p>}
        </div>
        {editable && <AddItemForm planId={plan.id} onAdded={(item) => setItems((prev) => [...prev, item])} />}
      </Card>
    </div>
  );
}

function DetailsForm({ plan, editable, onSaved }: { plan: Plan; editable: boolean; onSaved: (p: Partial<Plan>) => void }) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<DetailsForm>({
    resolver: zodResolver(updateCarePlanDetailsSchema),
    defaultValues: { summary: plan.summary ?? '', targetDate: plan.targetDate ?? '', goals: plan.goals },
  });
  const [goalsText, setGoalsText] = useState(plan.goals.join('\n'));
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const goals = goalsText.split('\n').map((g) => g.trim()).filter(Boolean);
    try {
      await api.patch(`/api/care-plans/${plan.id}`, { ...values, goals });
      onSaved({ summary: values.summary || null, targetDate: values.targetDate || null, goals });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save these details.');
    }
  });

  if (!editable) {
    return (
      <dl className="mt-3 space-y-2 text-sm text-brand-neutral-700">
        <div>
          <dt className="font-medium text-brand-neutral-900">Summary</dt>
          <dd>{plan.summary || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-brand-neutral-900">Goals</dt>
          <dd>{plan.goals.length ? <ul className="list-disc pl-4">{plan.goals.map((g) => <li key={g}>{g}</li>)}</ul> : '—'}</dd>
        </div>
      </dl>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="summary">Summary</Label>
        <Textarea id="summary" rows={2} {...register('summary')} />
      </div>
      <div className="max-w-xs">
        <Label htmlFor="targetDate">Target date</Label>
        <Input id="targetDate" type="date" {...register('targetDate')} />
      </div>
      <div>
        <Label htmlFor="goals">Goals (one per line)</Label>
        <Textarea id="goals" rows={3} value={goalsText} onChange={(e) => setGoalsText(e.target.value)} />
      </div>
      <Button type="submit" size="sm" loading={isSubmitting}>
        Save details
      </Button>
    </form>
  );
}

function ItemRow({ item, editable, onSaved }: { item: Item; editable: boolean; onSaved: (item: Item) => void }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(next: ItemStatus) {
    setStatus(next);
    setSaving(true);
    setError(null);
    try {
      const { item: updated } = await api.patch<{ item: Item }>(`/api/care-plan-items/${item.id}`, { status: next });
      onSaved(updated);
    } catch (err) {
      setStatus(item.status);
      setError(err instanceof ApiError ? err.message : 'Could not update this item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-card border border-brand-neutral-200 p-4">
      {error && (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-brand-neutral-900">{item.title}</p>
          <p className="text-xs text-brand-neutral-400">
            {item.type}
            {item.dueDate && ` · Due ${new Date(item.dueDate).toLocaleDateString()}`}
          </p>
          {item.description && <p className="mt-1 text-sm text-brand-neutral-600">{item.description}</p>}
          {item.patientMarkedDoneAt && (
            <p className="mt-1 text-xs text-emerald-700">Patient marked this done on {new Date(item.patientMarkedDoneAt).toLocaleDateString()}</p>
          )}
        </div>
        {editable ? (
          <Select value={status} onChange={(e) => handleStatusChange(e.target.value as ItemStatus)} disabled={saving} className="w-auto">
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : (
          <CarePlanItemStatusBadge status={item.status} />
        )}
      </div>
      {editable && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Close' : 'Edit'}
        </Button>
      )}
      {editing && <EditItemForm item={item} onSaved={(updated) => { onSaved(updated); setEditing(false); }} onCancel={() => setEditing(false)} />}
    </div>
  );
}

function EditItemForm({ item, onSaved, onCancel }: { item: Item; onSaved: (item: Item) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [dueDate, setDueDate] = useState(item.dueDate ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const dto = updateCarePlanItemSchema.parse({ title, description, dueDate, notes });
      const { item: updated } = await api.patch<{ item: Item }>(`/api/care-plan-items/${item.id}`, dto);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-brand-neutral-100 pt-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor={`title-${item.id}`}>Title</Label>
        <Input id={`title-${item.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`description-${item.id}`}>Description</Label>
        <Textarea id={`description-${item.id}`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="max-w-xs">
        <Label htmlFor={`dueDate-${item.id}`}>Due date</Label>
        <Input id={`dueDate-${item.id}`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`notes-${item.id}`}>Clinician notes</Label>
        <Textarea id={`notes-${item.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" loading={saving} onClick={handleSave}>
          Save item
        </Button>
      </div>
    </div>
  );
}

function AddItemForm({ planId, onAdded }: { planId: string; onAdded: (item: Item) => void }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ItemForm>({ resolver: zodResolver(createCarePlanItemSchema), defaultValues: { type: 'TASK' } });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { item } = await api.post<{ item: Item }>(`/api/care-plans/${planId}/items`, values);
      onAdded(item);
      reset({ type: 'TASK', title: '', description: '', dueDate: '', notes: '' });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this item.');
    }
  });

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        + Add item
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-card border border-brand-neutral-200 p-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" {...register('type')}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" type="date" {...register('dueDate')} />
        </div>
      </div>
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...register('title')} />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={2} {...register('description')} />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={isSubmitting}>
          Add item
        </Button>
      </div>
    </form>
  );
}
