'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, FieldError, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { createAvailabilitySchema } from '@/modules/doctors/doctors.schemas';
import type { z } from 'zod';

type Slot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  mode: 'VIDEO' | 'CLINIC';
};

type FormValues = z.infer<typeof createAvailabilitySchema>;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function AvailabilityManager({
  initial,
  enabledModes,
}: {
  initial: Slot[];
  enabledModes: ('VIDEO' | 'CLINIC')[];
}) {
  const [slots, setSlots] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createAvailabilitySchema),
    defaultValues: { dayOfWeek: 1, slotMinutes: 30, mode: enabledModes[0] },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { slot } = await api.post<{ slot: Slot }>('/api/doctors/me/availability', {
        ...values,
        dayOfWeek: Number(values.dayOfWeek),
        slotMinutes: Number(values.slotMinutes),
      });
      setSlots((prev) => [...prev, slot]);
      reset();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add availability.');
    }
  });

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/doctors/me/availability/${id}`);
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove slot.');
    }
  }

  if (enabledModes.length === 0) {
    return (
      <Alert tone="info">
        Enable a video or clinic consultation mode on your profile before adding availability.
      </Alert>
    );
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {[...slots]
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
          .map((s) => (
            <Card key={s.id} className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium text-brand-neutral-900">
                  {DAYS[s.dayOfWeek]}, {s.startTime}–{s.endTime}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={s.mode === 'VIDEO' ? 'blue' : 'orange'}>{s.mode}</Badge>
                  <span className="text-xs text-brand-neutral-400">{s.slotMinutes} min slots</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleRemove(s.id)}>
                Remove
              </Button>
            </Card>
          ))}
        {slots.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No availability set yet.</p>}
      </div>

      {showForm ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dayOfWeek">Day</Label>
              <Select id="dayOfWeek" {...register('dayOfWeek', { valueAsNumber: true })}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="mode">Mode</Label>
              <Select id="mode" {...register('mode')}>
                {enabledModes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="startTime">Start time</Label>
              <Input id="startTime" type="time" {...register('startTime')} />
              <FieldError>{errors.startTime?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="endTime">End time</Label>
              <Input id="endTime" type="time" {...register('endTime')} />
              <FieldError>{errors.endTime?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="slotMinutes">Slot length (minutes)</Label>
              <Input id="slotMinutes" inputMode="numeric" {...register('slotMinutes', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Add slot
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add availability
        </Button>
      )}
    </div>
  );
}
