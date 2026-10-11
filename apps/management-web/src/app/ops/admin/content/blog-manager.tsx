'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge, type Tone } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { ImageUploader } from '@abies/design-system/components/ui/file-uploader';
import { FieldHint, Input, Label, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import { BLOG_POST_SLUG_PATTERN, publicPathForBlogPost } from '@abies/domain/modules/content/blog.schemas';

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  authorName: string;
  coverImageKey: string | null;
  publishedAt: string | null;
  active: boolean;
}

function postStatus(p: BlogPostRow): { label: string; tone: Tone } {
  if (!p.publishedAt) return { label: 'Draft', tone: 'neutral' };
  if (!p.active) return { label: 'Hidden', tone: 'orange' };
  if (new Date(p.publishedAt).getTime() > Date.now()) return { label: 'Scheduled', tone: 'blue' };
  return { label: 'Published', tone: 'success' };
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function patchPost(id: string, payload: Record<string, unknown>, coverImage?: File | null) {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  if (coverImage) formData.append('coverImage', coverImage);
  const { post } = await api.patchForm<{ post: BlogPostRow }>(`/api/v1/admin/content/blog/${id}`, formData);
  return post;
}

export function BlogManager({ initial }: { initial: BlogPostRow[] }) {
  const [posts, setPosts] = useState(initial);
  const [modal, setModal] = useState<'create' | { edit: BlogPostRow } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyPatch(p: BlogPostRow, payload: Record<string, unknown>) {
    setError(null);
    try {
      const updated = await patchPost(p.id, payload);
      setPosts((prev) => prev.map((row) => (row.id === p.id ? updated : row)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this post.');
    }
  }

  async function handleRemove(p: BlogPostRow) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/content/blog/${p.id}`);
      setPosts((prev) => prev.filter((row) => row.id !== p.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this post.');
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
        Posts are read live by the public site at <code>/blog</code> — no rebuild needed. A post goes public once it has a
        publish date that has passed; a future date schedules it. Unpublishing clears the date and returns it to draft;
        hiding keeps the date but takes it off the site.
      </p>

      <div className="space-y-3">
        {posts.map((p) => {
          const status = postStatus(p);
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-brand-neutral-900">{p.title}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {p.coverImageKey && <Badge tone="purple">Cover image</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-brand-neutral-500">
                    <code>{publicPathForBlogPost(p.slug)}</code> · by {p.authorName}
                    {p.publishedAt ? ` · ${new Date(p.publishedAt).toLocaleString()}` : ''}
                  </p>
                  <p className="mt-1 max-w-xl text-sm text-brand-neutral-600">{p.excerpt}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setModal({ edit: p })}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => applyPatch(p, { publishedAt: p.publishedAt ? null : new Date().toISOString() })}
                  >
                    {p.publishedAt ? 'Unpublish' : 'Publish now'}
                  </Button>
                  {p.publishedAt && (
                    <Button variant="ghost" size="sm" onClick={() => applyPatch(p, { active: !p.active })}>
                      {p.active ? 'Hide' : 'Show'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(p)}>
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {posts.length === 0 && <p className="text-sm text-brand-neutral-500">No blog posts yet.</p>}
      </div>

      <Button variant="secondary" className="mt-6" onClick={() => setModal('create')}>
        + New post
      </Button>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'New blog post' : 'Edit blog post'}>
        {modal !== null && (
          <BlogPostForm
            existing={modal === 'create' ? null : modal.edit}
            onSaved={(post) => {
              setPosts((prev) => (prev.some((row) => row.id === post.id) ? prev.map((row) => (row.id === post.id ? post : row)) : [post, ...prev]));
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function BlogPostForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing: BlogPostRow | null;
  onSaved: (post: BlogPostRow) => void;
  onCancel: () => void;
}) {
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [authorName, setAuthorName] = useState(existing?.authorName ?? '');
  const [excerpt, setExcerpt] = useState(existing?.excerpt ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [publishedAt, setPublishedAt] = useState(existing?.publishedAt ? toLocalInput(existing.publishedAt) : '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [clearCoverImage, setClearCoverImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!existing && !BLOG_POST_SLUG_PATTERN.test(slug)) {
      setError('Slug must be lowercase letters, numbers and single hyphens (e.g. ayurveda-for-sleep).');
      return;
    }
    if (!title.trim() || !authorName.trim() || !excerpt.trim() || !body.trim()) {
      setError('Title, author, summary and body are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The datetime-local input drops seconds, so resending an untouched
      // date would quietly shift the original publication time.
      const dateUnchanged = existing && publishedAt === (existing.publishedAt ? toLocalInput(existing.publishedAt) : '');
      const fields = {
        title,
        authorName,
        excerpt,
        body,
        active,
        ...(dateUnchanged ? {} : { publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null }),
      };
      let post: BlogPostRow;
      if (existing) {
        post = await patchPost(existing.id, { ...fields, clearCoverImage: clearCoverImage && !coverImage }, coverImage);
      } else {
        const formData = new FormData();
        formData.append('payload', JSON.stringify({ slug, ...fields }));
        if (coverImage) formData.append('coverImage', coverImage);
        post = (await api.postForm<{ post: BlogPostRow }>('/api/v1/admin/content/blog', formData)).post;
      }
      onSaved(post);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this post.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="blog-slug">Slug</Label>
        <Input
          id="blog-slug"
          value={slug}
          disabled={Boolean(existing)}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="ayurveda-for-sleep"
        />
        <FieldHint>
          {existing
            ? 'The slug is fixed once created — it is the public URL.'
            : `Public URL: ${slug ? publicPathForBlogPost(slug) : '/blog/<slug>'}`}
        </FieldHint>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="blog-title">Title</Label>
          <Input id="blog-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="blog-author">Author (shown on the post)</Label>
          <Input id="blog-author" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Dr. A. Sharma" />
        </div>
      </div>
      <div>
        <Label htmlFor="blog-excerpt">Summary</Label>
        <Textarea id="blog-excerpt" rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
        <FieldHint>Shown on the blog list and used as the search/social-share description. Up to 500 characters.</FieldHint>
      </div>
      <div>
        <Label htmlFor="blog-body">Body</Label>
        <Textarea id="blog-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
        <FieldHint>Plain text. A blank line starts a new paragraph.</FieldHint>
      </div>
      <div>
        <Label htmlFor="blog-published-at">Publish date (optional)</Label>
        <Input id="blog-published-at" type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
        <FieldHint>Leave empty to keep this as a draft. A future date schedules the post.</FieldHint>
      </div>
      <ImageUploader
        label={existing?.coverImageKey ? 'Replace cover image (optional)' : 'Cover image (optional)'}
        accept="image/jpeg,image/png"
        maxSizeBytes={5 * 1024 * 1024}
        selectedFileName={coverImage?.name}
        onFileSelected={setCoverImage}
      />
      {existing?.coverImageKey && !coverImage && (
        <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
          <input
            type="checkbox"
            checked={clearCoverImage}
            onChange={(e) => setClearCoverImage(e.target.checked)}
            className="h-4 w-4 rounded border-brand-neutral-300"
          />
          Remove the current cover image
        </label>
      )}
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-brand-neutral-300"
        />
        Visible on the public site once published
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Create post'}
        </Button>
      </div>
    </div>
  );
}
