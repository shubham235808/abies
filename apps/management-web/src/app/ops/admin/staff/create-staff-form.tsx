'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

const ROLE_OPTIONS = [
  { value: 'CUSTOMER_SUPPORT', label: 'Customer Support' },
  { value: 'TECH_SUPPORT', label: 'Technical Support' },
  { value: 'SALES', label: 'Sales / Partner Ops' },
  { value: 'CARE_COORDINATOR', label: 'Care Coordinator' },
];

export function CreateStaffForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('CUSTOMER_SUPPORT');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/v1/admin/staff', { mobile, role, title: title || undefined });
      setOpen(false);
      setMobile('');
      setTitle('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this account.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-4">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          + Add staff account
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-4">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="role">Role</Label>
          <Select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="title">Title (optional)</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="L1 Support Agent" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="mobile">Mobile number</Label>
          <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" required />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit" loading={busy}>
            Create account
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
