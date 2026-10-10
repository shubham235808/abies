'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { FileUploader } from '@abies/design-system/components/ui/file-uploader';
import { Input, Label } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import { cn } from '@abies/design-system/cn';

export interface ProductVariantRow {
  id: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

export interface ProductRow {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  category: string | null;
  mrp: number | null;
  imageUrl: string | null;
  active: boolean;
  requiresPrescription: boolean;
  variants: ProductVariantRow[];
}

export function ProductsManager({ initial }: { initial: ProductRow[] }) {
  const [products, setProducts] = useState(initial);
  const [modal, setModal] = useState<'create' | { edit: ProductRow } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applySaved(p: ProductRow) {
    setProducts((prev) => (prev.some((row) => row.id === p.id) ? prev.map((row) => (row.id === p.id ? p : row)) : [p, ...prev]));
  }

  async function toggleActive(p: ProductRow) {
    setError(null);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ active: !p.active }));
      const { product } = await api.patchForm<{ product: ProductRow }>(`/api/v1/admin/products/${p.id}`, formData);
      applySaved(product);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this product.');
    }
  }

  return (
    <div className="mt-4">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="overflow-x-auto rounded-control border border-brand-neutral-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-neutral-50 text-left text-brand-neutral-600">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Product</th>
              <th className="px-4 py-2.5 font-semibold">Brand</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-4 py-2.5 font-semibold">MRP</th>
              <th className="px-4 py-2.5 font-semibold">Image</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-brand-neutral-500" colSpan={7}>
                  No products yet.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-t border-brand-neutral-100">
                <td className="px-4 py-2.5 font-medium text-brand-neutral-900">{p.name}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{p.brandName ?? '—'}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{p.category ?? '—'}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{p.mrp !== null ? `₹${p.mrp}` : '—'}</td>
                <td className="px-4 py-2.5">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API, not optimised by next/image
                    <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-control object-cover" />
                  ) : (
                    <span className="text-brand-neutral-400">none</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    className="text-xs font-medium text-brand-purple-600 hover:underline"
                  >
                    {p.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setModal({ edit: p })}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button variant="secondary" className="mt-4" onClick={() => setModal('create')}>
        + Add product
      </Button>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Add product' : 'Edit product'}>
        {modal !== null && (
          <ProductForm
            existing={modal === 'create' ? null : modal.edit}
            onSaved={(p) => {
              applySaved(p);
              // Keep the modal open on the freshly saved row so the admin can
              // immediately move on to variants without re-opening it.
              setModal({ edit: p });
            }}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function ProductForm({
  existing,
  onSaved,
  onClose,
}: {
  existing: ProductRow | null;
  onSaved: (p: ProductRow) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [genericName, setGenericName] = useState(existing?.genericName ?? '');
  const [brandName, setBrandName] = useState(existing?.brandName ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [mrp, setMrp] = useState(existing?.mrp != null ? String(existing.mrp) : '');
  const [requiresPrescription, setRequiresPrescription] = useState(existing?.requiresPrescription ?? false);
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Enter the product name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let product: ProductRow;
      if (existing) {
        const formData = new FormData();
        formData.append(
          'payload',
          JSON.stringify({
            name,
            genericName: genericName.trim() || null,
            brandName: brandName.trim() || null,
            category: category.trim() || null,
            mrp: mrp.trim() ? Number(mrp) : null,
            requiresPrescription,
          }),
        );
        if (image) formData.append('image', image);
        ({ product } = await api.patchForm<{ product: ProductRow }>(`/api/v1/admin/products/${existing.id}`, formData));
      } else {
        const formData = new FormData();
        formData.append('name', name);
        if (genericName.trim()) formData.append('genericName', genericName.trim());
        if (brandName.trim()) formData.append('brandName', brandName.trim());
        if (category.trim()) formData.append('category', category.trim());
        if (mrp.trim()) formData.append('mrp', mrp.trim());
        formData.append('requiresPrescription', String(requiresPrescription));
        if (image) formData.append('image', image);
        ({ product } = await api.postForm<{ product: ProductRow }>('/api/v1/admin/products', formData));
      }
      setImage(null);
      onSaved(product);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this product.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="prod-name">Product name</Label>
        <Input id="prod-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ashwagandha Capsules 500mg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="prod-brand">Brand</Label>
          <Input id="prod-brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="prod-generic">Generic name</Label>
          <Input id="prod-generic" value={genericName} onChange={(e) => setGenericName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="prod-category">Category</Label>
          <Input id="prod-category" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="prod-mrp">MRP (₹)</Label>
          <Input id="prod-mrp" type="number" min={0} step={1} inputMode="numeric" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="e.g. 349" />
        </div>
      </div>
      <FileUploader
        label={existing ? 'Replace product image (optional)' : 'Product image (JPEG, PNG or WebP, 2 MB max)'}
        accept="image/jpeg,image/png,image/webp"
        maxSizeBytes={2 * 1024 * 1024}
        selectedFileName={image?.name}
        onFileSelected={setImage}
      />
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" checked={requiresPrescription} onChange={(e) => setRequiresPrescription(e.target.checked)} />
        Requires a prescription
      </label>

      {existing && (
        <VariantsSection
          productId={existing.id}
          variants={existing.variants}
          onChange={(variants) => onSaved({ ...existing, variants })}
        />
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </div>
  );
}

// EXPANSION-1's purchasable pack sizes. Only shown once a product exists —
// a variant is always scoped to a medicineId, so there's nothing to attach
// one to until the create form above has produced a row.
function VariantsSection({
  productId,
  variants,
  onChange,
}: {
  productId: string;
  variants: ProductVariantRow[];
  onChange: (variants: ProductVariantRow[]) => void;
}) {
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { variant } = await api.post<{ variant: ProductVariantRow }>(`/api/v1/admin/products/${productId}/variants`, {
        label: newLabel.trim(),
      });
      onChange([...variants, variant].sort((a, b) => a.sortOrder - b.sortOrder));
      setNewLabel('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this variant.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLabel(v: ProductVariantRow) {
    if (!editLabel.trim() || editLabel.trim() === v.label) {
      setEditingId(null);
      return;
    }
    setError(null);
    try {
      const { variant } = await api.patch<{ variant: ProductVariantRow }>(
        `/api/v1/admin/products/${productId}/variants/${v.id}`,
        { label: editLabel.trim() },
      );
      onChange(variants.map((row) => (row.id === v.id ? variant : row)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not rename this variant.');
    }
  }

  async function handleToggle(v: ProductVariantRow) {
    setError(null);
    try {
      const { variant } = await api.patch<{ variant: ProductVariantRow }>(
        `/api/v1/admin/products/${productId}/variants/${v.id}`,
        { active: !v.active },
      );
      onChange(variants.map((row) => (row.id === v.id ? variant : row)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this variant.');
    }
  }

  async function handleRemove(v: ProductVariantRow) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/products/${productId}/variants/${v.id}`);
      onChange(variants.filter((row) => row.id !== v.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this variant.');
    }
  }

  return (
    <div className="rounded-control border border-brand-neutral-100 p-3">
      <p className="text-sm font-medium text-brand-neutral-900">Variants (pack sizes)</p>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
      <ul className="mt-2 space-y-1.5">
        {variants.length === 0 && <li className="text-sm text-brand-neutral-500">No variants yet — this product is sold as a single size.</li>}
        {variants.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
            {editingId === v.id ? (
              <div className="flex flex-1 items-center gap-2">
                <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="py-1.5" />
                <button type="button" onClick={() => handleSaveLabel(v)} className="text-xs font-medium text-brand-purple-600 hover:underline">
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-brand-neutral-500 hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(v.id);
                  setEditLabel(v.label);
                }}
                className={cn('text-left hover:underline', v.active ? 'text-brand-neutral-900' : 'text-brand-neutral-400')}
              >
                {v.label}
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => handleToggle(v)} className="text-xs font-medium text-brand-purple-600 hover:underline">
                {v.active ? 'Active' : 'Inactive'}
              </button>
              <button type="button" onClick={() => handleRemove(v)} className="text-xs font-medium text-brand-neutral-500 hover:underline">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. 500gm" />
        <Button type="button" size="sm" variant="secondary" loading={busy} onClick={handleAdd}>
          + Add
        </Button>
      </div>
    </div>
  );
}
