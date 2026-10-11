'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { ImageUploader } from '@abies/design-system/components/ui/file-uploader';
import { Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import { MediaPickerField, type PickedMedia } from './media-picker-field';
import { TranslationsControl, type TranslationField, type TranslationRow } from './translations-control';

export interface TestimonialRow {
  id: string;
  authorName: string;
  authorRole: string | null;
  quote: string;
  rating: number | null;
  priority: number;
  active: boolean;
  photoAssetId?: string | null;
  videoAssetId?: string | null;
  translations: TranslationRow[];
}

const TRANSLATED_FIELDS: TranslationField[] = [
  { key: 'quote', label: 'Quote', kind: 'textarea', rows: 4 },
  { key: 'authorName', label: 'Author name', optional: true, hint: 'Leave blank to keep the English name.' },
  { key: 'authorRole', label: 'Role / city', optional: true },
];

export function TestimonialsManager({ initial }: { initial: TestimonialRow[] }) {
  const [testimonials, setTestimonials] = useState(initial);
  const [modal, setModal] = useState<'create' | { edit: TestimonialRow } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(t: TestimonialRow) {
    setError(null);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ active: !t.active }));
      const { testimonial } = await api.patchForm<{ testimonial: TestimonialRow }>(`/api/v1/admin/content/testimonials/${t.id}`, formData);
      setTestimonials((prev) => prev.map((row) => (row.id === t.id ? { ...row, ...testimonial } : row)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this testimonial.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/content/testimonials/${id}`);
      setTestimonials((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this testimonial.');
    }
  }

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {testimonials.map((t) => (
          <Card key={t.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-brand-neutral-900">{t.authorName}</p>
                  {t.authorRole && <span className="text-sm text-brand-neutral-500">· {t.authorRole}</span>}
                  <Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="mt-1 max-w-xl text-sm text-brand-neutral-600">&ldquo;{t.quote}&rdquo;</p>
                <p className="mt-1 text-xs text-brand-neutral-400">
                  priority {t.priority}
                  {t.rating ? ` · ${t.rating}/5` : ''}
                  {t.videoAssetId ? ' · video' : ''}
                </p>
                <TranslationsControl
                  endpoint={`/api/v1/admin/content/testimonials/${t.id}/translations`}
                  source={t}
                  fields={TRANSLATED_FIELDS}
                  translations={t.translations}
                  onChange={(translations) =>
                    setTestimonials((prev) => prev.map((row) => (row.id === t.id ? { ...row, translations } : row)))
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setModal({ edit: t })}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                  {t.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(t.id)}>
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {testimonials.length === 0 && <p className="text-sm text-brand-neutral-500">No testimonials yet.</p>}
      </div>

      <Button variant="secondary" className="mt-6" onClick={() => setModal('create')}>
        + New testimonial
      </Button>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'New testimonial' : 'Edit testimonial'}>
        {modal !== null && (
          <TestimonialForm
            existing={modal === 'create' ? null : modal.edit}
            onSaved={(t) => {
              setTestimonials((prev) => (prev.some((row) => row.id === t.id) ? prev.map((row) => (row.id === t.id ? t : row)) : [t, ...prev]));
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function TestimonialForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing: TestimonialRow | null;
  onSaved: (t: TestimonialRow) => void;
  onCancel: () => void;
}) {
  const [authorName, setAuthorName] = useState(existing?.authorName ?? '');
  const [authorRole, setAuthorRole] = useState(existing?.authorRole ?? '');
  const [quote, setQuote] = useState(existing?.quote ?? '');
  const [rating, setRating] = useState(existing?.rating ? String(existing.rating) : '');
  const [priority, setPriority] = useState(String(existing?.priority ?? 0));
  const [photo, setPhoto] = useState<File | null>(null);
  const [libraryPhoto, setLibraryPhoto] = useState<PickedMedia | null>(existing?.photoAssetId ? { id: existing.photoAssetId } : null);
  const [video, setVideo] = useState<PickedMedia | null>(existing?.videoAssetId ? { id: existing.videoAssetId } : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!authorName.trim() || !quote.trim()) {
      setError('Author name and quote are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        authorName,
        authorRole: authorRole || undefined,
        quote,
        rating: rating ? Number(rating) : undefined,
        priority: Number(priority) || 0,
        // Sent only when changed on edit: null clears a library reference.
        // A freshly uploaded photo replaces a library one server-side.
        ...(!photo && (libraryPhoto?.id ?? null) !== (existing?.photoAssetId ?? null) ? { photoAssetId: libraryPhoto?.id ?? null } : {}),
        ...((video?.id ?? null) !== (existing?.videoAssetId ?? null) ? { videoAssetId: video?.id ?? null } : {}),
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      if (photo) formData.append('photo', photo);

      const { testimonial } = existing
        ? await api.patchForm<{ testimonial: TestimonialRow }>(`/api/v1/admin/content/testimonials/${existing.id}`, formData)
        : await api.postForm<{ testimonial: TestimonialRow }>('/api/v1/admin/content/testimonials', formData);
      onSaved(testimonial);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this testimonial.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="testimonial-name">Author name</Label>
          <Input id="testimonial-name" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="testimonial-role">Author role (optional)</Label>
          <Input id="testimonial-role" value={authorRole} onChange={(e) => setAuthorRole(e.target.value)} placeholder="Patient, Pune" />
        </div>
      </div>
      <div>
        <Label htmlFor="testimonial-quote">Quote</Label>
        <Textarea id="testimonial-quote" rows={4} value={quote} onChange={(e) => setQuote(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="testimonial-rating">Rating (optional)</Label>
          <Select id="testimonial-rating" value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">No rating</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="testimonial-priority">Priority (higher shows first)</Label>
          <Input id="testimonial-priority" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
      </div>
      <ImageUploader
        // Remounting drops the uploader's local preview once a library photo is picked instead.
        key={libraryPhoto?.id ?? 'upload'}
        label={existing ? 'Replace photo (optional)' : 'Photo (optional)'}
        accept="image/jpeg,image/png"
        maxSizeBytes={5 * 1024 * 1024}
        selectedFileName={photo?.name}
        onFileSelected={(file) => {
          setPhoto(file);
          if (file) setLibraryPhoto(null);
        }}
      />
      <MediaPickerField
        label="…or use a photo from the media library"
        kind="IMAGE"
        value={libraryPhoto}
        onChange={(picked) => {
          setLibraryPhoto(picked);
          if (picked) setPhoto(null);
        }}
      />
      <MediaPickerField label="Video (optional)" kind="VIDEO" value={video} onChange={setVideo} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Add testimonial'}
        </Button>
      </div>
    </div>
  );
}
