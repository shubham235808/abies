'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FieldHint, Input, Label, Select } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import {
  DEFAULT_NAV_MENUS,
  NAV_MENU_LOCATIONS,
  NAV_MENU_LOCATION_LABELS,
  type NavMenuLocationKey,
} from '@abies/domain/modules/content/nav.schemas';
import { publicPathForContentPage } from '@abies/domain/modules/content/pages.schemas';

export interface NavItemRow {
  id: string;
  location: NavMenuLocationKey;
  label: string;
  href: string | null;
  contentPageId: string | null;
  contentPage: { id: string; slug: string; title: string; active: boolean } | null;
  priority: number;
  active: boolean;
}

export interface NavPageOption {
  id: string;
  slug: string;
  title: string;
  active: boolean;
}

export function NavManager({ initial, pages }: { initial: NavItemRow[]; pages: NavPageOption[] }) {
  const [items, setItems] = useState(initial);
  const [modal, setModal] = useState<{ create: NavMenuLocationKey } | { edit: NavItemRow } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState<NavMenuLocationKey | null>(null);

  function itemsFor(location: NavMenuLocationKey) {
    return items.filter((i) => i.location === location).sort((a, b) => b.priority - a.priority);
  }

  function upsertLocal(item: NavItemRow) {
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item]));
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const { item } = await api.patch<{ item: NavItemRow }>(`/api/v1/admin/content/nav/${id}`, body);
    upsertLocal(item);
  }

  async function toggleActive(item: NavItemRow) {
    setError(null);
    try {
      await patch(item.id, { active: !item.active });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this link.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/content/nav/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this link.');
    }
  }

  // Same distinct-priority-per-position approach as the FAQ manager, so
  // reordering works even when every item still has the default priority 0.
  async function move(location: NavMenuLocationKey, index: number, direction: -1 | 1) {
    const list = itemsFor(location);
    const targetIndex = index + direction;
    const a = list[index];
    const b = list[targetIndex];
    if (!a || !b) return;
    setError(null);
    try {
      await Promise.all([patch(a.id, { priority: list.length - targetIndex }), patch(b.id, { priority: list.length - index })]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder these links.');
    }
  }

  // Sequential, not Promise.all: priorities must land in order, and a
  // partial failure should leave a predictable prefix rather than a random
  // subset.
  async function copyDefaults(location: NavMenuLocationKey) {
    setError(null);
    setCopying(location);
    const defaults = DEFAULT_NAV_MENUS[location];
    try {
      for (const [i, link] of defaults.entries()) {
        const { item } = await api.post<{ item: NavItemRow }>('/api/v1/admin/content/nav', {
          location,
          label: link.label,
          href: link.href,
          priority: defaults.length - i,
        });
        upsertLocal(item);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not copy the default links.');
    } finally {
      setCopying(null);
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
        The public header and footer read these menus on every request. A menu you haven&apos;t configured shows the built-in
        defaults listed under it; once it has any link here, only these links are shown.
      </p>

      <div className="space-y-6">
        {NAV_MENU_LOCATIONS.map((location) => {
          const list = itemsFor(location);
          return (
            <Card key={location}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-brand-neutral-900">{NAV_MENU_LOCATION_LABELS[location]}</h2>
                <Button variant="secondary" size="sm" onClick={() => setModal({ create: location })}>
                  + Add link
                </Button>
              </div>

              {list.length === 0 ? (
                <div className="mt-3 rounded-card bg-brand-neutral-50 p-3 text-sm text-brand-neutral-600">
                  <p>
                    Not configured — the public site shows the defaults:{' '}
                    {DEFAULT_NAV_MENUS[location].map((l) => l.label).join(' · ')}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    loading={copying === location}
                    onClick={() => copyDefaults(location)}
                  >
                    Start from these defaults
                  </Button>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-brand-neutral-100">
                  {list.map((item, index) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-brand-neutral-900">{item.label}</span>
                          <Badge tone={item.active ? 'success' : 'neutral'}>{item.active ? 'Active' : 'Hidden'}</Badge>
                          {item.contentPage && !item.contentPage.active && <Badge tone="orange">Page unpublished</Badge>}
                        </div>
                        <p className="text-xs text-brand-neutral-500">
                          {item.contentPage
                            ? `Page: ${item.contentPage.title} (${publicPathForContentPage(item.contentPage.slug)})`
                            : item.href}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="ghost" size="sm" onClick={() => move(location, index, -1)} disabled={index === 0}>
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => move(location, index, 1)}
                          disabled={index === list.length - 1}
                        >
                          ↓
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setModal({ edit: item })}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(item)}>
                          {item.active ? 'Hide' : 'Show'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRemove(item.id)}>
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal && 'edit' in modal ? 'Edit link' : 'New link'}>
        {modal !== null && (
          <NavItemForm
            existing={'edit' in modal ? modal.edit : null}
            location={'edit' in modal ? modal.edit.location : modal.create}
            pages={pages}
            onSaved={(item) => {
              upsertLocal(item);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function NavItemForm({
  existing,
  location,
  pages,
  onSaved,
  onCancel,
}: {
  existing: NavItemRow | null;
  location: NavMenuLocationKey;
  pages: NavPageOption[];
  onSaved: (item: NavItemRow) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? '');
  const [target, setTarget] = useState<'url' | 'page'>(existing?.contentPageId ? 'page' : 'url');
  const [href, setHref] = useState(existing?.href ?? '');
  const [contentPageId, setContentPageId] = useState(existing?.contentPageId ?? pages[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!label.trim()) {
      setError('A label is required.');
      return;
    }
    if (target === 'url' && !href.trim()) {
      setError('Enter a link, e.g. /doctors or https://…');
      return;
    }
    if (target === 'page' && !contentPageId) {
      setError('Choose a content page.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const targetFields =
        target === 'url' ? { href: href.trim(), contentPageId: existing ? null : undefined } : { contentPageId, href: existing ? null : undefined };
      const { item } = existing
        ? await api.patch<{ item: NavItemRow }>(`/api/v1/admin/content/nav/${existing.id}`, { label, ...targetFields })
        : await api.post<{ item: NavItemRow }>('/api/v1/admin/content/nav', { location, label, ...targetFields });
      onSaved(item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-brand-neutral-500">{NAV_MENU_LOCATION_LABELS[location]}</p>
      <div>
        <Label htmlFor="nav-label">Label</Label>
        <Input id="nav-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="nav-target">Links to</Label>
        <Select id="nav-target" value={target} onChange={(e) => setTarget(e.target.value as 'url' | 'page')}>
          <option value="url">A site path or external URL</option>
          <option value="page" disabled={pages.length === 0}>
            A content page{pages.length === 0 ? ' (none created yet)' : ''}
          </option>
        </Select>
      </div>
      {target === 'url' ? (
        <div>
          <Label htmlFor="nav-href">Link</Label>
          <Input id="nav-href" value={href} onChange={(e) => setHref(e.target.value)} placeholder="/doctors" />
          <FieldHint>A site path starting with / or an https:// URL.</FieldHint>
        </div>
      ) : (
        <div>
          <Label htmlFor="nav-page">Content page</Label>
          <Select id="nav-page" value={contentPageId} onChange={(e) => setContentPageId(e.target.value)}>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({publicPathForContentPage(p.slug)}){p.active ? '' : ' — unpublished'}
              </option>
            ))}
          </Select>
          <FieldHint>The link is hidden automatically while the page is unpublished.</FieldHint>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Add link'}
        </Button>
      </div>
    </div>
  );
}
