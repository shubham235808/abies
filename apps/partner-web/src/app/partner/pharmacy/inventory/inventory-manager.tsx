'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { DataTable, type DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { FieldError, Input, Label } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';
import { addInventorySchema } from '@abies/domain/modules/medicines/catalogue.schemas';

type InventoryRow = {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityAvailable: number;
  price: number;
  medicine: { id: string; name: string; form: string | null; strength: string | null; requiresPrescription: boolean; hsnCode: string | null; isFmcg: boolean };
  variant: { label: string } | null;
};

type FormValues = z.infer<typeof addInventorySchema>;

export function InventoryManager({ initial }: { initial: InventoryRow[] }) {
  const [rows, setRows] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/pharmacies/me/inventory/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this batch.');
    }
  }

  const columns: DataTableColumn<InventoryRow>[] = [
    {
      key: 'medicine',
      label: 'Medicine',
      render: (r) => (
        <>
          <p className="font-medium text-brand-neutral-900">
            {r.medicine.name}
            {r.variant && <span className="text-xs font-normal text-brand-neutral-500"> ({r.variant.label})</span>}
          </p>
          <p className="text-xs text-brand-neutral-400">{[r.medicine.form, r.medicine.strength].filter(Boolean).join(' · ')}</p>
        </>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={r.medicine.requiresPrescription ? 'orange' : 'success'}>
            {r.medicine.requiresPrescription ? 'Rx required' : 'OTC'}
          </Badge>
          {r.medicine.isFmcg && <Badge tone="blue">FMCG</Badge>}
        </div>
      ),
    },
    { key: 'hsn', label: 'HSN', render: (r) => r.medicine.hsnCode ?? <span className="text-brand-orange-600">Not set</span> },
    { key: 'batch', label: 'Batch', render: (r) => r.batchNumber },
    { key: 'quantity', label: 'Qty', align: 'right', render: (r) => r.quantityAvailable },
    { key: 'price', label: 'Price', align: 'right', render: (r) => `₹${r.price}` },
    { key: 'expiry', label: 'Expiry', render: (r) => new Date(r.expiryDate).toLocaleDateString() },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => handleRemove(r.id)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage="No inventory yet." />

      {showForm ? (
        <div className="max-w-2xl">
          <NewBatchForm
            onCreated={(item) => {
              setRows((prev) => [item, ...prev]);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add batch
        </Button>
      )}
    </div>
  );
}

function NewBatchForm({ onCreated, onCancel }: { onCreated: (item: InventoryRow) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(addInventorySchema), defaultValues: { requiresPrescription: false } });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { item } = await api.post<{ item: InventoryRow }>('/api/pharmacies/me/inventory', values);
      onCreated(item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this batch.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-brand-neutral-500">
        Type the medicine name — if it already exists in the ABIES catalogue (e.g. from a prescription), your batch
        is added to it; otherwise a new catalogue entry is created.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Medicine name</Label>
          <Input id="name" placeholder="e.g. Paracetamol 500mg" {...register('name')} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="genericName">Generic name</Label>
          <Input id="genericName" {...register('genericName')} />
        </div>
        <div>
          <Label htmlFor="form">Form</Label>
          <Input id="form" placeholder="e.g. Tablet" {...register('form')} />
        </div>
        <div>
          <Label htmlFor="strength">Strength</Label>
          <Input id="strength" placeholder="e.g. 500mg" {...register('strength')} />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" placeholder="e.g. Ayurvedic OTC" {...register('category')} />
        </div>
        <div>
          <Label htmlFor="hsnCode">HSN code</Label>
          <Input id="hsnCode" placeholder="e.g. 3004" {...register('hsnCode')} />
          <p className="mt-1 text-xs text-brand-neutral-400">Needed to sell this item at the POS counter — only filled if not already set.</p>
        </div>
        <div>
          <Label htmlFor="variantLabel">Pack size (optional)</Label>
          <Input id="variantLabel" placeholder="e.g. 250gm" {...register('variantLabel')} />
          <p className="mt-1 text-xs text-brand-neutral-400">
            Leave blank for a single-size product. Reuse the same size text across batches to group them as one
            purchasable pack size.
          </p>
        </div>
        <div>
          <Label htmlFor="batchNumber">Batch number</Label>
          <Input id="batchNumber" {...register('batchNumber')} />
          <FieldError>{errors.batchNumber?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="expiryDate">Expiry date</Label>
          <Input id="expiryDate" type="date" {...register('expiryDate', { setValueAs: (v) => (v ? new Date(v).toISOString() : v) })} />
          <FieldError>{errors.expiryDate?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="quantityAvailable">Quantity available</Label>
          <Input id="quantityAvailable" inputMode="numeric" {...register('quantityAvailable', { valueAsNumber: true })} />
          <FieldError>{errors.quantityAvailable?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="price">Price (₹)</Label>
          <Input id="price" inputMode="numeric" {...register('price', { valueAsNumber: true })} />
          <FieldError>{errors.price?.message}</FieldError>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" {...register('requiresPrescription')} />
        Requires a prescription (leave unchecked for an over-the-counter item)
      </label>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" {...register('isFmcg')} />
        FMCG item (wellness/personal-care product, listed separately from the Ayurveda catalogue)
      </label>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Add batch
        </Button>
      </div>
    </form>
  );
}
