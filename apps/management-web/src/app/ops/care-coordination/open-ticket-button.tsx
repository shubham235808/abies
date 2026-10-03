'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { api, ApiError } from '@abies/design-system/api-client';

export function OpenTicketButton({
  patientMobile,
  patientName,
  itemTitle,
}: {
  patientMobile: string;
  patientName: string;
  itemTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const { ticket } = await api.post<{ ticket: { id: string } }>('/api/support/tickets', {
        category: 'CLINICAL_CONCERN',
        subject: `Care plan follow-up at risk: ${itemTitle}`,
        description: `${patientName}'s care plan item "${itemTitle}" was flagged at risk by care coordination and needs follow-up.`,
        linkedPatientMobile: patientMobile,
      });
      setOpened(true);
      router.push(`/ops/care-coordination/tickets/${ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open a ticket for this patient.');
    } finally {
      setBusy(false);
    }
  }

  if (opened) return <span className="text-xs text-emerald-700">Ticket opened</span>;

  return (
    <div className="text-right">
      <Button size="sm" variant="ghost" loading={busy} onClick={handleClick}>
        Open ticket for this patient
      </Button>
      {error && (
        <Alert tone="error" className="mt-1">
          {error}
        </Alert>
      )}
    </div>
  );
}
