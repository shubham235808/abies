'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';

const STAGES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'FOLLOW_UP', 'CONVERTED', 'LOST', 'DUPLICATE', 'INVALID', 'DO_NOT_CONTACT',
];
const ACTIVITY_TYPES = ['NOTE', 'CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'MEETING'];

type Assignee = { id: string; name: string | null; mobile: string; role: string };

// Each action calls the same API the rest of the platform uses. The server
// re-checks the role and the lead's scope; these controls only hide what the
// role can't do.
export function LeadActions({
  leadId,
  stage,
  assignedToId,
  canWrite,
  canAssign,
}: {
  leadId: string;
  stage: string;
  assignedToId: string | null;
  canWrite: boolean;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newStage, setNewStage] = useState(stage);
  const [reason, setReason] = useState('');
  const [owner, setOwner] = useState(assignedToId ?? '');
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [activityType, setActivityType] = useState('NOTE');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (!canAssign) return;
    fetch('/api/v1/crm/assignees', { credentials: 'include' })
      .then((r) => r.json())
      .then((b) => setAssignees(b.users ?? []))
      .catch(() => setAssignees([]));
  }, [canAssign]);

  async function call(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/leads/${leadId}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = Array.isArray(data?.issues) ? data.issues[0]?.message : undefined;
        throw new Error(first ?? data?.error ?? 'Could not save that change.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that change.');
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite && !canAssign) return null;

  return (
    <div className="mt-6 space-y-5 border-t border-brand-neutral-100 pt-5">
      {error && <Alert tone="error">{error}</Alert>}

      {canWrite && (
        <div className="space-y-2">
          <Label htmlFor="stage">Stage</Label>
          <div className="flex flex-wrap gap-2">
            <Select id="stage" value={newStage} onChange={(e) => setNewStage(e.target.value)} className="max-w-[200px]">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
            {newStage === 'LOST' && (
              <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1" />
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={busy || newStage === stage}
              onClick={() => call('/stage', { stage: newStage, reason: reason || undefined })}
            >
              Update stage
            </Button>
          </div>
        </div>
      )}

      {canAssign && (
        <div className="space-y-2">
          <Label htmlFor="owner">Owner</Label>
          <div className="flex gap-2">
            <Select id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="max-w-[260px]">
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.mobile} ({a.role.replaceAll('_', ' ').toLowerCase()})
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || owner === (assignedToId ?? '')}
              onClick={() => call('/assign', { assignedToId: owner || null })}
            >
              Save owner
            </Button>
          </div>
        </div>
      )}

      {canWrite && (
        <div className="space-y-2">
          <Label htmlFor="activity">Add activity</Label>
          <div className="flex flex-wrap gap-2">
            <Select id="activity" value={activityType} onChange={(e) => setActivityType(e.target.value)} className="max-w-[160px]">
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.toLowerCase()}
                </option>
              ))}
            </Select>
            <Input placeholder="What happened?" value={summary} onChange={(e) => setSummary(e.target.value)} className="flex-1" />
            <Button
              type="button"
              disabled={busy || !summary.trim()}
              onClick={async () => {
                await call('/activities', { type: activityType, summary });
                setSummary('');
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
