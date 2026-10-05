'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label } from '@abies/design-system/components/ui/input';

// Multipart upload: the API takes the product fields and an optional image
// file in one request. The session cookie is sent with the request.
export function CreateProductForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    try {
      const res = await fetch('/api/v1/admin/products', {
        method: 'POST',
        body: new FormData(form),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const first = Array.isArray(body?.issues) ? body.issues[0]?.message : undefined;
        throw new Error(first ?? body?.error ?? 'Could not save this product.');
      }
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this product.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-4">
        <Button onClick={() => setOpen(true)}>+ Add product</Button>
      </div>
    );
  }

  return (
    <Card className="mt-4 p-5">
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {error && (
          <Alert tone="error" className="sm:col-span-2">
            {error}
          </Alert>
        )}
        <div className="sm:col-span-2">
          <Label htmlFor="name">Product name</Label>
          <Input id="name" name="name" required minLength={2} placeholder="e.g. Ashwagandha Capsules 500mg" />
        </div>
        <div>
          <Label htmlFor="brandName">Brand</Label>
          <Input id="brandName" name="brandName" />
        </div>
        <div>
          <Label htmlFor="genericName">Generic name</Label>
          <Input id="genericName" name="genericName" />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" name="category" />
        </div>
        <div>
          <Label htmlFor="mrp">MRP (₹)</Label>
          <Input id="mrp" name="mrp" type="number" min={0} step={1} inputMode="numeric" placeholder="e.g. 349" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="image">Product image (JPEG, PNG or WebP, 2 MB max)</Label>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-neutral-700 sm:col-span-2">
          <input type="checkbox" name="requiresPrescription" value="true" />
          Requires a prescription
        </label>
        <div className="flex gap-3 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save product
          </Button>
        </div>
      </form>
    </Card>
  );
}
