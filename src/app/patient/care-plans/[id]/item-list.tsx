'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { CarePlanItemStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api-client';

type Item = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  patientMarkedDoneAt: string | null;
};

export function ItemList({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(item: Item) {
    setBusyId(item.id);
    setError(null);
    try {
      const { item: updated } = await api.post<{ item: Item }>(`/api/care-plan-items/${item.id}/acknowledge`, {
        done: !item.patientMarkedDoneAt,
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this item.');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="mt-3 text-sm text-brand-neutral-500">No items yet.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {items.map((item) => (
        <div key={item.id} className="rounded-card border border-brand-neutral-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-brand-neutral-900">{item.title}</p>
              <p className="text-xs text-brand-neutral-400">
                {item.type}
                {item.dueDate && ` · Due ${new Date(item.dueDate).toLocaleDateString()}`}
              </p>
              {item.description && <p className="mt-1 text-sm text-brand-neutral-600">{item.description}</p>}
            </div>
            <CarePlanItemStatusBadge status={item.status} />
          </div>
          <Button
            variant={item.patientMarkedDoneAt ? 'secondary' : 'primary'}
            size="sm"
            className="mt-3"
            loading={busyId === item.id}
            onClick={() => toggle(item)}
          >
            {item.patientMarkedDoneAt ? `✓ Marked done — undo` : "Mark as done"}
          </Button>
        </div>
      ))}
    </div>
  );
}
