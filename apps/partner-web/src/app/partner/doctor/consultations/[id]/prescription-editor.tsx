'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { FieldError, Input, Label, Textarea } from '@abies/design-system/components/ui/input';
import { savePrescriptionSchema } from '@abies/domain/modules/consultations/consultations.schemas';
import { api, ApiError } from '@abies/design-system/api-client';

type FormValues = z.infer<typeof savePrescriptionSchema>;

export type PrescriptionResult = {
  id: string;
  status: string;
  doctorNotes: string | null;
  finalizedAt: string | null;
  supersedesId: string | null;
  items: {
    id: string;
    productName: string;
    dosage: string | null;
    frequency: string | null;
    durationDays: number | null;
    route: string | null;
    instructions: string | null;
    startDate: string | null;
    endDate: string | null;
  }[];
};

const EMPTY_ITEM = { productName: '', dosage: '', frequency: '', route: '', instructions: '', startDate: '', endDate: '' };

export function PrescriptionEditor({
  consultationId,
  prescriptionId,
  initialDoctorNotes,
  initialItems,
  onSaved,
  onCancel,
}: {
  consultationId: string;
  prescriptionId?: string;
  initialDoctorNotes?: string | null;
  initialItems?: FormValues['items'];
  onSaved: (prescription: PrescriptionResult) => void;
  onCancel: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(savePrescriptionSchema),
    defaultValues: { doctorNotes: initialDoctorNotes ?? '', items: initialItems?.length ? initialItems : [EMPTY_ITEM] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = prescriptionId
        ? await api.patch<{ prescription: PrescriptionResult }>(`/api/v1/prescriptions/${prescriptionId}`, values)
        : await api.post<{ prescription: PrescriptionResult }>(`/api/v1/consultations/${consultationId}/prescriptions`, values);
      onSaved(result.prescription);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this prescription.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-brand-neutral-200 p-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={field.id} className="grid gap-2 rounded-lg border border-brand-neutral-100 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor={`items.${index}.productName`}>Medicine / product</Label>
              <Input id={`items.${index}.productName`} {...register(`items.${index}.productName`)} />
              <FieldError>{errors.items?.[index]?.productName?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor={`items.${index}.dosage`}>Dosage</Label>
              <Input id={`items.${index}.dosage`} placeholder="e.g. 2 tablets" {...register(`items.${index}.dosage`)} />
            </div>
            <div>
              <Label htmlFor={`items.${index}.frequency`}>Frequency</Label>
              <Input id={`items.${index}.frequency`} placeholder="e.g. twice daily" {...register(`items.${index}.frequency`)} />
            </div>
            <div>
              <Label htmlFor={`items.${index}.durationDays`}>Duration (days)</Label>
              <Input
                id={`items.${index}.durationDays`}
                inputMode="numeric"
                {...register(`items.${index}.durationDays`, {
                  // valueAsNumber converts '' to NaN, which z.number().optional()
                  // rejects (optional only excuses an absent key, not an invalid
                  // one) — silently blocking submit with no visible error, the
                  // same failure shape as the isoDate fix in patients.schemas.ts.
                  setValueAs: (v) => (v === '' ? undefined : Number(v)),
                })}
              />
              <FieldError>{errors.items?.[index]?.durationDays?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor={`items.${index}.route`}>Route</Label>
              <Input id={`items.${index}.route`} placeholder="e.g. oral" {...register(`items.${index}.route`)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`items.${index}.instructions`}>Instructions</Label>
              <Textarea id={`items.${index}.instructions`} rows={2} {...register(`items.${index}.instructions`)} />
            </div>
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="w-fit">
                Remove item
              </Button>
            )}
          </div>
        ))}
        <FieldError>{errors.items?.message}</FieldError>
        <Button type="button" variant="secondary" size="sm" onClick={() => append(EMPTY_ITEM)}>
          + Add item
        </Button>
      </div>

      <div>
        <Label htmlFor="doctorNotes">Notes for this prescription (optional)</Label>
        <Textarea id="doctorNotes" rows={2} {...register('doctorNotes')} />
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save draft
        </Button>
      </div>
    </form>
  );
}
