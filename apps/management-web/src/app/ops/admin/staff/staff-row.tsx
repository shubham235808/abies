'use client';

import { useState } from 'react';
import { Button } from '@abies/design-system/components/ui/button';
import { api, ApiError } from '@abies/design-system/api-client';

export function StaffRow({
  userId,
  mobile,
  role,
  title,
  active: initialActive,
}: {
  userId: string;
  mobile: string;
  role: string;
  title: string | null;
  active: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/admin/staff/${userId}/${active ? 'deactivate' : 'reactivate'}`, {});
      setActive(!active);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm">
      <div>
        <p className="font-medium text-brand-neutral-900">{mobile}</p>
        <p className="mt-1 text-sm text-brand-neutral-600">
          {role.replace(/_/g, ' ')} {title ? `· ${title}` : ''}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={
            active
              ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
              : 'rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700'
          }
        >
          {active ? 'Active' : 'Inactive'}
        </span>
        <Button size="sm" variant="ghost" loading={busy} onClick={toggle}>
          {active ? 'Deactivate' : 'Reactivate'}
        </Button>
      </div>
    </div>
  );
}
