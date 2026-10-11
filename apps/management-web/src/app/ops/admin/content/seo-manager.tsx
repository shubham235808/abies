'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { ImageUploader } from '@abies/design-system/components/ui/file-uploader';
import { FieldHint, Input, Label, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import { dedicatedPathForContentPage, publicPathForContentPage } from '@abies/domain/modules/content/pages.schemas';
import { contentPageSeoFallback, SEO_PAGES, seoKeyForContentPage } from '@abies/domain/modules/content/seo.pages';
import { TranslationsControl, type TranslationField, type TranslationRow } from './translations-control';

export interface SeoRow {
  id: string;
  pageKey: string;
  title: string;
  description: string;
  keywords: string[];
  ogImageKey: string | null;
  active: boolean;
  translations: TranslationRow[];
}

const TRANSLATED_FIELDS: TranslationField[] = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description', kind: 'textarea', rows: 3 },
  { key: 'keywords', label: 'Keywords', kind: 'list', optional: true, hint: 'Comma-separated; blank keeps the English keywords.' },
];

export interface SeoContentPage {
  slug: string;
  title: string;
  body: string;
}

interface SeoTarget {
  pageKey: string;
  label: string;
  path: string;
  defaultTitle: string;
  defaultDescription: string;
}

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 320;

export function SeoManager({ initial, contentPages }: { initial: SeoRow[]; contentPages: SeoContentPage[] }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<SeoTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  // about-us/terms/privacy already appear under their fixed route keys, so
  // only /pages/<slug> pages get their own "page:<slug>" entry.
  const targets: SeoTarget[] = [
    ...SEO_PAGES.map((p) => ({
      pageKey: p.key,
      label: p.label,
      path: p.path,
      defaultTitle: p.defaultTitle,
      defaultDescription: p.defaultDescription,
    })),
    ...contentPages
      .filter((p) => !dedicatedPathForContentPage(p.slug))
      .map((p) => {
        const fallback = contentPageSeoFallback(p);
        return {
          pageKey: seoKeyForContentPage(p.slug),
          label: p.title,
          path: publicPathForContentPage(p.slug),
          defaultTitle: fallback.title,
          defaultDescription: fallback.description,
        };
      }),
  ];

  async function resetToDefaults(row: SeoRow) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/content/seo/${row.id}`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset this page.');
    }
  }

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <p className="mb-4 max-w-3xl text-sm text-brand-neutral-500">
        Search-engine title, description and social-share (Open Graph) image for each public page, read live on every request.
        Pages without custom metadata use the built-in defaults shown — never blank.
      </p>

      <div className="space-y-3">
        {targets.map((t) => {
          const row = rows.find((r) => r.pageKey === t.pageKey);
          const live = row?.active ? row : null;
          return (
            <Card key={t.pageKey}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-brand-neutral-900">{t.label}</p>
                    <span className="text-xs text-brand-neutral-500">{t.path}</span>
                    {live ? (
                      <Badge tone="success">Custom</Badge>
                    ) : row ? (
                      <Badge tone="neutral">Custom (inactive)</Badge>
                    ) : (
                      <Badge tone="neutral">Default</Badge>
                    )}
                    {live?.ogImageKey && <Badge tone="purple">OG image</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-brand-neutral-700">{live?.title ?? t.defaultTitle}</p>
                  <p className="text-sm text-brand-neutral-500">{live?.description ?? t.defaultDescription}</p>
                  {row ? (
                    <TranslationsControl
                      endpoint={`/api/v1/admin/content/seo/${row.id}/translations`}
                      source={row}
                      fields={TRANSLATED_FIELDS}
                      translations={row.translations}
                      onChange={(translations) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, translations } : r)))}
                    />
                  ) : (
                    <p className="mt-2 text-xs text-brand-neutral-400">Customise this page to add translated metadata.</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                    {row ? 'Edit' : 'Customise'}
                  </Button>
                  {row && (
                    <Button variant="ghost" size="sm" onClick={() => resetToDefaults(row)}>
                      Reset to default
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? `SEO — ${editing.label}` : 'SEO'}>
        {editing && (
          <SeoForm
            target={editing}
            existing={rows.find((r) => r.pageKey === editing.pageKey) ?? null}
            onSaved={(row) => {
              setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]));
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function SeoForm({
  target,
  existing,
  onSaved,
  onCancel,
}: {
  target: SeoTarget;
  existing: SeoRow | null;
  onSaved: (row: SeoRow) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? target.defaultTitle);
  const [description, setDescription] = useState(existing?.description ?? target.defaultDescription);
  const [keywords, setKeywords] = useState(existing?.keywords.join(', ') ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [ogImage, setOgImage] = useState<File | null>(null);
  const [clearOgImage, setClearOgImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }
    if (title.length > TITLE_MAX || description.length > DESCRIPTION_MAX) {
      setError(`Keep the title under ${TITLE_MAX} and the description under ${DESCRIPTION_MAX} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const keywordList = keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const formData = new FormData();
      if (existing) {
        formData.append('payload', JSON.stringify({ title, description, keywords: keywordList, active, clearOgImage: clearOgImage && !ogImage }));
      } else {
        formData.append('payload', JSON.stringify({ pageKey: target.pageKey, title, description, keywords: keywordList, active }));
      }
      if (ogImage) formData.append('ogImage', ogImage);

      const { entry } = existing
        ? await api.patchForm<{ entry: SeoRow }>(`/api/v1/admin/content/seo/${existing.id}`, formData)
        : await api.postForm<{ entry: SeoRow }>('/api/v1/admin/content/seo', formData);
      onSaved(entry);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save SEO metadata.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="seo-title">Title</Label>
        <Input id="seo-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <FieldHint>
          {title.length}/{TITLE_MAX} — search results usually show about 60 characters.
        </FieldHint>
      </div>
      <div>
        <Label htmlFor="seo-description">Description</Label>
        <Textarea id="seo-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <FieldHint>
          {description.length}/{DESCRIPTION_MAX} — search results usually show about 160 characters.
        </FieldHint>
      </div>
      <div>
        <Label htmlFor="seo-keywords">Keywords (optional)</Label>
        <Input id="seo-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="ayurveda, panchakarma" />
        <FieldHint>Comma-separated.</FieldHint>
      </div>
      <ImageUploader
        label={existing?.ogImageKey ? 'Replace social-share image (optional)' : 'Social-share image (optional)'}
        accept="image/jpeg,image/png"
        maxSizeBytes={5 * 1024 * 1024}
        selectedFileName={ogImage?.name}
        onFileSelected={setOgImage}
      />
      {existing?.ogImageKey && !ogImage && (
        <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
          <input
            type="checkbox"
            checked={clearOgImage}
            onChange={(e) => setClearOgImage(e.target.checked)}
            className="h-4 w-4 rounded border-brand-neutral-300"
          />
          Remove the current social-share image
        </label>
      )}
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-brand-neutral-300"
        />
        Active (unchecked uses the built-in defaults)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          Save
        </Button>
      </div>
    </div>
  );
}
