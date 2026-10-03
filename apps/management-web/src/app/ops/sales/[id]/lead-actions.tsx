'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import { PartnerLeadStageBadge } from '@abies/design-system/components/ui/badge';
import { api, ApiError } from '@abies/design-system/api-client';

const STAGE_OPTIONS = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'DOCUMENTATION',
  'VERIFICATION',
  'COMMERCIAL',
  'ENABLEMENT',
  'ACTIVATED',
  'REJECTED',
];

export interface LeadDetail {
  id: string;
  kind: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  city: string | null;
  source: string | null;
  stage: string;
  notes: string | null;
  nextFollowUpAt: string | null;
  owner: { mobile: string } | null;
  documentKeys: string[];
}

export function LeadActions({ lead: initialLead }: { lead: LeadDetail }) {
  const [lead, setLead] = useState(initialLead);
  const [stage, setStage] = useState(initialLead.stage);
  const [notes, setNotes] = useState(initialLead.notes ?? '');
  const [nextFollowUpAt, setNextFollowUpAt] = useState(initialLead.nextFollowUpAt?.slice(0, 10) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClaim() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ lead: LeadDetail }>(`/api/partner-leads/${lead.id}/claim`, {});
      setLead((prev) => ({ ...prev, owner: result.lead.owner }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not claim this lead.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.patch<{ lead: LeadDetail }>(`/api/partner-leads/${lead.id}`, {
        stage,
        notes: notes || undefined,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
      });
      setLead(result.lead);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this lead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">{lead.contactName}</h1>
          <p className="mt-1 text-sm text-brand-neutral-600">
            {lead.kind.replace(/_/g, ' ')} · {lead.contactPhone} {lead.city ? `· ${lead.city}` : ''}
          </p>
        </div>
        <PartnerLeadStageBadge stage={lead.stage} />
      </div>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <Card className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-brand-neutral-600">Owner: {lead.owner ? lead.owner.mobile : 'unowned'}</p>
          {!lead.owner && (
            <Button size="sm" variant="secondary" loading={busy} onClick={handleClaim}>
              Claim lead
            </Button>
          )}
        </div>

        <div>
          <Label htmlFor="stage">Stage</Label>
          <Select id="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="nextFollowUpAt">Next follow-up</Label>
          <Input id="nextFollowUpAt" type="date" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button loading={busy} onClick={handleSave}>
          Save
        </Button>
      </Card>
    </div>
  );
}
