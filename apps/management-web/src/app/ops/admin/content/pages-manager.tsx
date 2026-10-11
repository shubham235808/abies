'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FieldHint, Input, Label, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import {
  CONTENT_PAGE_SLUG_PATTERN,
  DEDICATED_CONTENT_PAGE_PATHS,
  publicPathForContentPage,
} from '@abies/domain/modules/content/pages.schemas';
import { TranslationsControl, type TranslationField, type TranslationRow } from './translations-control';

export interface ContentPageRow {
  id: string;
  slug: string;
  title: string;
  body: string;
  active: boolean;
  translations: TranslationRow[];
}

const TRANSLATED_FIELDS: TranslationField[] = [
  { key: 'title', label: 'Title' },
  { key: 'body', label: 'Body', kind: 'textarea', rows: 12, hint: 'Plain text. A blank line starts a new paragraph.' },
];

export function PagesManager({ initial }: { initial: ContentPageRow[] }) {
  const [pages, setPages] = useState(initial);
  const [modal, setModal] = useState<{ create: string } | { edit: ContentPageRow } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missingDedicated = Object.keys(DEDICATED_CONTENT_PAGE_PATHS).filter((slug) => !pages.some((p) => p.slug === slug));

  async function toggleActive(page: ContentPageRow) {
    setError(null);
    try {
      const { page: updated } = await api.patch<{ page: ContentPageRow }>(`/api/v1/admin/content/pages/${page.id}`, {
        active: !page.active,
      });
      setPages((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this page.');
    }
  }

  async function handleRemove(page: ContentPageRow) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/content/pages/${page.id}`);
      setPages((prev) => prev.filter((p) => p.id !== page.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this page.');
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
        Every page is read live by the public site — no rebuild needed. <code>about-us</code>, <code>terms</code> and{' '}
        <code>privacy</code> replace the copy on /about, /terms and /privacy; any other slug is published at{' '}
        <code>/pages/&lt;slug&gt;</code>. A translation is served at the same URL to visitors who pick that language. Removing a
        page also removes its translations and any navigation links pointing to it.
      </p>

      <div className="space-y-3">
        {pages.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-brand-neutral-900">{p.title}</p>
                  <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Published' : 'Draft'}</Badge>
                </div>
                <p className="mt-1 text-sm text-brand-neutral-500">
                  <code>{p.slug}</code> → {publicPathForContentPage(p.slug)}
                </p>
                <TranslationsControl
                  endpoint={`/api/v1/admin/content/pages/${p.id}/translations`}
                  source={p}
                  fields={TRANSLATED_FIELDS}
                  translations={p.translations}
                  onChange={(translations) => setPages((prev) => prev.map((x) => (x.id === p.id ? { ...x, translations } : x)))}
                />
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" size="sm" onClick={() => setModal({ edit: p })}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                  {p.active ? 'Unpublish' : 'Publish'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(p)}>
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {pages.length === 0 && <p className="text-sm text-brand-neutral-500">No content pages yet.</p>}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setModal({ create: '' })}>
          + New page
        </Button>
        {missingDedicated.map((slug) => (
          <Button key={slug} variant="ghost" onClick={() => setModal({ create: slug })}>
            + Write {DEDICATED_CONTENT_PAGE_PATHS[slug]} copy
          </Button>
        ))}
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal && 'edit' in modal ? 'Edit page' : 'New page'}>
        {modal !== null && (
          <PageForm
            existing={'edit' in modal ? modal.edit : null}
            presetSlug={'create' in modal ? modal.create : ''}
            onSaved={(page) => {
              setPages((prev) => (prev.some((p) => p.id === page.id) ? prev.map((p) => (p.id === page.id ? page : p)) : [page, ...prev]));
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function PageForm({
  existing,
  presetSlug,
  onSaved,
  onCancel,
}: {
  existing: ContentPageRow | null;
  presetSlug: string;
  onSaved: (page: ContentPageRow) => void;
  onCancel: () => void;
}) {
  const [slug, setSlug] = useState(existing?.slug ?? presetSlug);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!existing && !CONTENT_PAGE_SLUG_PATTERN.test(slug)) {
      setError('Slug must be lowercase letters, numbers and single hyphens (e.g. shipping-policy).');
      return;
    }
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { page } = existing
        ? await api.patch<{ page: ContentPageRow }>(`/api/v1/admin/content/pages/${existing.id}`, { title, body, active })
        : await api.post<{ page: ContentPageRow }>('/api/v1/admin/content/pages', { slug, title, body, active });
      onSaved(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this page.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="page-slug">Slug</Label>
        <Input
          id="page-slug"
          value={slug}
          disabled={Boolean(existing)}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="shipping-policy"
        />
        <FieldHint>
          {existing
            ? 'The slug is fixed once created — links and SEO settings depend on it.'
            : `Public URL: ${slug ? publicPathForContentPage(slug) : '/pages/<slug>'}`}
        </FieldHint>
      </div>
      <div>
        <Label htmlFor="page-title">Title</Label>
        <Input id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="page-body">Body</Label>
        <Textarea id="page-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
        <FieldHint>Plain text. A blank line starts a new paragraph.</FieldHint>
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-brand-neutral-300"
        />
        Published (visible on the public site)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Create page'}
        </Button>
      </div>
    </div>
  );
}
