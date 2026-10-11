'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { ConfirmationDialog } from '@abies/design-system/components/ui/confirmation-dialog';
import { Input, Select } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';
import { MEDIA_IMAGE_MIME_TYPES, MEDIA_VIDEO_MAX_BYTES, MEDIA_VIDEO_MIME_TYPES } from '@abies/domain/modules/media/media.schemas';

export type MediaKind = 'IMAGE' | 'VIDEO';

export interface MediaAssetRow {
  id: string;
  originalName: string;
  mimeType: string;
  kind: MediaKind;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
  fileUrl: string;
}

export interface MediaPage {
  items: MediaAssetRow[];
  total: number;
  page: number;
  pageSize: number;
}

// Matches the server's default UPLOAD_MAX_BYTES; the server stays the
// authority (it reads the env value), this only saves a doomed upload.
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export function mediaFileUrl(id: string): string {
  return `/api/v1/admin/media/${id}/file`;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

async function fetchMediaPage(page: number, filters: { q: string; kind: MediaKind | '' }): Promise<MediaPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.kind) params.set('kind', filters.kind);
  return api.get<MediaPage>(`/api/v1/admin/media?${params}`);
}

export function MediaThumb({ kind, src, alt }: { kind: MediaKind; src: string; alt: string }) {
  if (kind === 'VIDEO') {
    return (
      <div className="relative h-full w-full bg-brand-neutral-900">
        {/* #t= makes the browser fetch just enough to paint a poster frame. */}
        <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-brand-neutral-900" aria-hidden>
            ▶
          </span>
        </span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- served by the API behind the admin session, not optimisable by next/image
  return <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />;
}

// One component for both the standalone library tab and the picker modal:
// with onSelect it becomes a chooser (fixed kind, no delete), without it a
// manager. Uploading is available in both so a picker never dead-ends on
// "the file I need isn't in the library yet".
export function MediaLibrary({
  initial,
  kind,
  onSelect,
}: {
  initial?: MediaPage;
  kind?: MediaKind;
  onSelect?: (asset: MediaAssetRow) => void;
}) {
  const [items, setItems] = useState<MediaAssetRow[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [page, setPage] = useState(initial?.page ?? 0);
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<MediaKind | ''>(kind ?? '');
  const [loading, setLoading] = useState(!initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaAssetRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const accept = [
    ...(kindFilter !== 'VIDEO' ? [...MEDIA_IMAGE_MIME_TYPES] : []),
    ...(kindFilter !== 'IMAGE' ? [...MEDIA_VIDEO_MIME_TYPES] : []),
  ].join(',');

  function applyPage(result: MediaPage) {
    setItems((prev) => (result.page === 1 ? result.items : [...prev, ...result.items]));
    setTotal(result.total);
    setPage(result.page);
  }

  function failLoad(err: unknown) {
    setError(err instanceof ApiError ? err.message : 'Could not load the media library.');
  }

  async function load(nextPage: number, filters = { q, kind: kindFilter }) {
    setLoading(true);
    setError(null);
    try {
      applyPage(await fetchMediaPage(nextPage, filters));
    } catch (err) {
      failLoad(err);
    } finally {
      setLoading(false);
    }
  }

  // The library tab is server-rendered with its first page; the picker
  // isn't, so it fetches when opened.
  useEffect(() => {
    if (initial) return;
    fetchMediaPage(1, { q: '', kind: kind ?? '' })
      .then(applyPage, failLoad)
      .finally(() => setLoading(false));
  }, [initial, kind]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    void load(1);
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    const isVideo = MEDIA_VIDEO_MIME_TYPES.has(file.type);
    if (!isVideo && !MEDIA_IMAGE_MIME_TYPES.has(file.type)) {
      setError('Upload a JPEG, PNG or WebP image, or an MP4 or WebM video.');
      return;
    }
    const max = isVideo ? MEDIA_VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > max) {
      setError(`That file is too large — ${isVideo ? 'videos' : 'images'} can be up to ${formatBytes(max)}.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { asset } = await api.postForm<{ asset: MediaAssetRow }>('/api/v1/admin/media', formData);
      setItems((prev) => [asset, ...prev]);
      setTotal((n) => n + 1);
      if (onSelect && (!kind || asset.kind === kind)) onSelect(asset);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload this file.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/api/v1/admin/media/${pendingDelete.id}`);
      setItems((prev) => prev.filter((a) => a.id !== pendingDelete.id));
      setTotal((n) => n - 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this file.');
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-end gap-2">
          <Input
            aria-label="Search by file name"
            placeholder="Search by file name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-[12rem] flex-1"
          />
          {!kind && (
            <Select
              aria-label="File type"
              value={kindFilter}
              onChange={(e) => {
                const next = e.target.value as MediaKind | '';
                setKindFilter(next);
                void load(1, { q, kind: next });
              }}
              className="w-36"
            >
              <option value="">All files</option>
              <option value="IMAGE">Images</option>
              <option value="VIDEO">Videos</option>
            </Select>
          )}
          <Button type="submit" variant="secondary" loading={loading}>
            Search
          </Button>
        </form>
        <Button type="button" loading={uploading} onClick={() => fileInput.current?.click()}>
          Upload {kind === 'VIDEO' ? 'video' : kind === 'IMAGE' ? 'image' : 'file'}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />
      </div>
      <p className="mt-2 text-xs text-brand-neutral-500">
        {kind !== 'VIDEO' && `Images: JPEG, PNG or WebP up to ${formatBytes(IMAGE_MAX_BYTES)}. `}
        {kind !== 'IMAGE' && `Videos: MP4 or WebM up to ${formatBytes(MEDIA_VIDEO_MAX_BYTES)}.`}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((asset) => (
          <div key={asset.id} className="overflow-hidden rounded-card border border-brand-neutral-200 bg-white">
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(asset)}
              className="block aspect-[4/3] w-full overflow-hidden bg-brand-neutral-100 enabled:cursor-pointer enabled:hover:opacity-90"
              aria-label={onSelect ? `Choose ${asset.originalName}` : asset.originalName}
            >
              <MediaThumb kind={asset.kind} src={asset.fileUrl} alt={asset.originalName} />
            </button>
            <div className="p-2">
              <p className="truncate text-sm font-medium text-brand-neutral-900" title={asset.originalName}>
                {asset.originalName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brand-neutral-500">
                <Badge tone={asset.kind === 'VIDEO' ? 'blue' : 'neutral'}>{asset.kind === 'VIDEO' ? 'Video' : 'Image'}</Badge>
                <span>{formatBytes(asset.sizeBytes)}</span>
                {asset.width && asset.height && (
                  <span>
                    {asset.width}×{asset.height}
                  </span>
                )}
                {asset.durationSeconds !== null && <span>{formatDuration(asset.durationSeconds)}</span>}
              </div>
              <div className="mt-2 flex gap-1">
                {onSelect ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => onSelect(asset)}>
                    Choose
                  </Button>
                ) : (
                  <>
                    <a href={asset.fileUrl} target="_blank" rel="noreferrer" className="px-2 py-1 text-xs font-medium text-brand-purple-600 hover:underline">
                      Open
                    </a>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(asset)}>
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && !loading && (
        <p className="mt-4 text-sm text-brand-neutral-500">
          {q || kindFilter ? 'No files match this search.' : 'The media library is empty. Upload an image or video to start.'}
        </p>
      )}

      {items.length < total && (
        <Button type="button" variant="ghost" className="mt-4" loading={loading} onClick={() => load(page + 1)}>
          Load more ({total - items.length} more)
        </Button>
      )}

      <ConfirmationDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this file?"
        description={`"${pendingDelete?.originalName ?? ''}" will be removed from the library and from storage. Files still used by a testimonial can't be deleted.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
      />
    </div>
  );
}
