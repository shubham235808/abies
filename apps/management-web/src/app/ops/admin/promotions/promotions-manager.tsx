'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge, type Tone } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FileUploader } from '@abies/design-system/components/ui/file-uploader';
import { Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';

const PLACEMENTS = [
  { value: 'PUBLIC_HOME_HERO', label: 'Public homepage — hero' },
  { value: 'PUBLIC_HOME_SERVICES', label: 'Public homepage — services strip' },
  { value: 'PATIENT_HOME_HERO', label: 'Patient dashboard — hero' },
  { value: 'PATIENT_HOME_DOCTORS', label: 'Patient dashboard — near "Doctors for you"' },
  { value: 'PATIENT_HOME_DIAGNOSTICS', label: 'Patient dashboard — near "Diagnostics near you"' },
  { value: 'PATIENT_HOME_MEDICINES', label: 'Patient dashboard — near "ABIES Medicines"' },
  { value: 'PATIENT_HOME_PANCHAKARMA', label: 'Patient dashboard — near "Panchakarma near you"' },
] as const;

const ENTITY_TYPES = ['DOCTOR', 'PANCHAKARMA_CENTRE', 'DIAGNOSTIC_LAB', 'DIAGNOSTIC_TEST', 'MEDICINE', 'CAMPAIGN'] as const;

export interface PromotionRow {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  placement: string;
  entityType: string | null;
  entityId: string | null;
  startAt: string;
  endAt: string;
  priority: number;
  active: boolean;
  targetLocations: string[];
  targetLanguages: string[];
  impressions: number;
  clicks: number;
}

function statusOf(p: PromotionRow): { label: string; tone: Tone } {
  if (!p.active) return { label: 'Inactive', tone: 'neutral' };
  const now = Date.now();
  if (now < new Date(p.startAt).getTime()) return { label: 'Scheduled', tone: 'blue' };
  if (now > new Date(p.endAt).getTime()) return { label: 'Expired', tone: 'neutral' };
  return { label: 'Live', tone: 'success' };
}

function placementLabel(value: string) {
  return PLACEMENTS.find((p) => p.value === value)?.label ?? value;
}

export function PromotionsManager({ initial }: { initial: PromotionRow[] }) {
  const [promotions, setPromotions] = useState(initial);
  const [modal, setModal] = useState<'create' | { edit: PromotionRow } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(p: PromotionRow) {
    setError(null);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ active: !p.active }));
      const { promotion } = await api.patchForm<{ promotion: PromotionRow }>(`/api/admin/promotions/${p.id}`, formData);
      setPromotions((prev) => prev.map((row) => (row.id === p.id ? { ...row, ...promotion } : row)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this promotion.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/admin/promotions/${id}`);
      setPromotions((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this promotion.');
    }
  }

  return (
    <div className="mt-6">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {promotions.map((p) => {
          const status = statusOf(p);
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-brand-neutral-900">{p.title}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-brand-neutral-500">{placementLabel(p.placement)}</p>
                  <p className="mt-1 text-xs text-brand-neutral-400">
                    {new Date(p.startAt).toLocaleDateString()} – {new Date(p.endAt).toLocaleDateString()} · priority {p.priority}
                    {p.targetLocations.length > 0 && ` · ${p.targetLocations.join(', ')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setModal({ edit: p })}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                    {p.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(p.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {promotions.length === 0 && <p className="text-sm text-brand-neutral-500">No promotions yet.</p>}
      </div>

      <Button variant="secondary" className="mt-6" onClick={() => setModal('create')}>
        + New promotion
      </Button>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'New promotion' : 'Edit promotion'}>
        {modal !== null && (
          <PromotionForm
            existing={modal === 'create' ? null : modal.edit}
            onSaved={(p) => {
              setPromotions((prev) => (prev.some((row) => row.id === p.id) ? prev.map((row) => (row.id === p.id ? p : row)) : [p, ...prev]));
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PromotionForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing: PromotionRow | null;
  onSaved: (p: PromotionRow) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [ctaLabel, setCtaLabel] = useState(existing?.ctaLabel ?? '');
  const [ctaHref, setCtaHref] = useState(existing?.ctaHref ?? '');
  const [placement, setPlacement] = useState(existing?.placement ?? PLACEMENTS[0].value);
  const [entityType, setEntityType] = useState(existing?.entityType ?? '');
  const [entityId, setEntityId] = useState(existing?.entityId ?? '');
  const [startAt, setStartAt] = useState(existing ? toLocalInput(existing.startAt) : '');
  const [endAt, setEndAt] = useState(existing ? toLocalInput(existing.endAt) : '');
  const [priority, setPriority] = useState(String(existing?.priority ?? 0));
  const [targetLocations, setTargetLocations] = useState(existing?.targetLocations.join(', ') ?? '');
  const [targetLanguages, setTargetLanguages] = useState(existing?.targetLanguages.join(', ') ?? '');
  const [desktopImage, setDesktopImage] = useState<File | null>(null);
  const [mobileImage, setMobileImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!title || !placement || !startAt || !endAt || (!existing && !desktopImage)) {
      setError('Title, placement, dates, and a desktop image are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title,
        subtitle: subtitle || undefined,
        description: description || undefined,
        ctaLabel: ctaLabel || undefined,
        ctaHref: ctaHref || undefined,
        placement,
        entityType: entityType || undefined,
        entityId: entityType ? entityId || undefined : undefined,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        priority: Number(priority) || 0,
        targetLocations: targetLocations.split(',').map((s) => s.trim()).filter(Boolean),
        targetLanguages: targetLanguages.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      if (desktopImage) formData.append('desktopImage', desktopImage);
      if (mobileImage) formData.append('mobileImage', mobileImage);

      const { promotion } = existing
        ? await api.patchForm<{ promotion: PromotionRow }>(`/api/admin/promotions/${existing.id}`, formData)
        : await api.postForm<{ promotion: PromotionRow }>('/api/admin/promotions', formData);
      onSaved(promotion);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this promotion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="promo-title">Title</Label>
          <Input id="promo-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="promo-subtitle">Subtitle</Label>
          <Input id="promo-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="promo-description">Description</Label>
        <Textarea id="promo-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="promo-cta-label">CTA label</Label>
          <Input id="promo-cta-label" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Book now" />
        </div>
        <div>
          <Label htmlFor="promo-cta-href">CTA link</Label>
          <Input id="promo-cta-href" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/doctors" />
        </div>
      </div>
      <div>
        <Label htmlFor="promo-placement">Placement</Label>
        <Select id="promo-placement" value={placement} onChange={(e) => setPlacement(e.target.value)}>
          {PLACEMENTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="promo-entity-type">Linked entity type (optional)</Label>
          <Select id="promo-entity-type" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">None</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>
        {entityType && (
          <div>
            <Label htmlFor="promo-entity-id">Linked entity ID</Label>
            <Input id="promo-entity-id" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="promo-start">Starts</Label>
          <Input id="promo-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="promo-end">Ends</Label>
          <Input id="promo-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="promo-priority">Priority (higher shows first)</Label>
        <Input id="promo-priority" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="promo-locations">Target cities (comma-separated, blank = all)</Label>
          <Input id="promo-locations" value={targetLocations} onChange={(e) => setTargetLocations(e.target.value)} placeholder="Pune, Bengaluru" />
        </div>
        <div>
          <Label htmlFor="promo-languages">Target languages (comma-separated, blank = all)</Label>
          <Input id="promo-languages" value={targetLanguages} onChange={(e) => setTargetLanguages(e.target.value)} placeholder="Hindi, Marathi" />
        </div>
      </div>
      <FileUploader
        label={existing ? 'Replace desktop image (optional)' : 'Desktop image'}
        accept="image/jpeg,image/png"
        maxSizeBytes={5 * 1024 * 1024}
        selectedFileName={desktopImage?.name}
        onFileSelected={setDesktopImage}
      />
      <FileUploader
        label="Mobile image (optional)"
        accept="image/jpeg,image/png"
        maxSizeBytes={5 * 1024 * 1024}
        selectedFileName={mobileImage?.name}
        onFileSelected={setMobileImage}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Create promotion'}
        </Button>
      </div>
    </div>
  );
}
