'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, FieldError, Select } from '@abies/design-system/components/ui/input';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { api, ApiError } from '@abies/design-system/api-client';
import { createFamilyMemberSchema } from '@abies/domain/modules/patients/patients.schemas';
import type { z } from 'zod';

type FamilyMember = {
  id: string;
  name: string;
  relation: string;
  dateOfBirth: string | null;
  gender: string | null;
  mobile: string | null;
};

type FormValues = z.infer<typeof createFamilyMemberSchema>;

const RELATIONS = ['PARENT', 'SPOUSE', 'CHILD', 'DEPENDENT', 'OTHER'];

export function FamilyManager({ initial }: { initial: FamilyMember[] }) {
  const [members, setMembers] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createFamilyMemberSchema), defaultValues: { relation: 'CHILD' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const cleaned = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
      const { member } = await api.post<{ member: FamilyMember }>('/api/patients/me/family', cleaned);
      setMembers((prev) => [...prev, member]);
      reset({ name: '', relation: 'CHILD', dateOfBirth: '', gender: '', mobile: '' });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add family member.');
    }
  });

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/patients/me/family/${id}`);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove family member.');
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
        {members.map((m) => (
          <Card key={m.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-brand-neutral-900">{m.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone="purple">{m.relation}</Badge>
                {m.mobile && <span className="text-xs text-brand-neutral-400">{m.mobile}</span>}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleRemove(m.id)}>
              Remove
            </Button>
          </Card>
        ))}
        {members.length === 0 && !showForm && (
          <p className="text-sm text-brand-neutral-500">No family members added yet.</p>
        )}
      </div>

      {showForm ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register('name')} />
              <FieldError>{errors.name?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="relation">Relation</Label>
              <Select id="relation" {...register('relation')}>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
            </div>
            <div>
              <Label htmlFor="mobile">Mobile (optional)</Label>
              <Input id="mobile" {...register('mobile')} />
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Add family member
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add family member
        </Button>
      )}
    </div>
  );
}
