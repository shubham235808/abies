'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Textarea } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type TestOption = { id: string; name: string };
type Package = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  tests: { test: TestOption }[];
};

// Direct pattern reuse of tests-manager.tsx — the one real difference is
// the create form's test multi-select (a package is only meaningful as a
// bundle of this lab's own tests).
export function PackagesManager({ initial, availableTests }: { initial: Package[]; availableTests: TestOption[] }) {
  const [packages, setPackages] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(pkg: Package) {
    setError(null);
    try {
      const { package: updated } = await api.patch<{ package: Package }>(`/api/labs/me/packages/${pkg.id}`, { active: !pkg.active });
      setPackages((prev) => prev.map((p) => (p.id === pkg.id ? updated : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this package.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/labs/me/packages/${id}`);
      setPackages((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this package.');
    }
  }

  if (availableTests.length === 0) {
    return <p className="mt-6 text-sm text-brand-neutral-500">Add at least one test to your catalogue before creating a package.</p>;
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {packages.map((p) => (
          <Card key={p.id} className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-brand-neutral-900">{p.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                  <span className="text-xs text-brand-neutral-500">₹{p.price}</span>
                </div>
                <p className="mt-1 text-xs text-brand-neutral-400">{p.tests.map((t) => t.test.name).join(', ')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                  {p.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(p.id)}>
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {packages.length === 0 && !showForm && <p className="text-sm text-brand-neutral-500">No packages yet.</p>}
      </div>

      {showForm ? (
        <NewPackageForm
          availableTests={availableTests}
          onCreated={(pkg) => {
            setPackages((prev) => [pkg, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setShowForm(true)}>
          + Add package
        </Button>
      )}
    </div>
  );
}

function NewPackageForm({
  availableTests,
  onCreated,
  onCancel,
}: {
  availableTests: TestOption[];
  onCreated: (pkg: Package) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleTest(id: string) {
    setSelectedTestIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!name || !price || selectedTestIds.length === 0) {
      setError('Name, price, and at least one test are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { package: pkg } = await api.post<{ package: Package }>('/api/labs/me/packages', {
        name,
        description: description || undefined,
        price: Number(price),
        testIds: selectedTestIds,
      });
      onCreated(pkg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this package.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-card border border-brand-neutral-200 p-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pkg-name">Name</Label>
          <Input id="pkg-name" placeholder="e.g. Full Body Health Check" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pkg-price">Price (₹)</Label>
          <Input id="pkg-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="pkg-description">Description</Label>
        <Textarea id="pkg-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label>Included tests</Label>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {availableTests.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm text-brand-neutral-700">
              <input type="checkbox" checked={selectedTestIds.includes(t.id)} onChange={() => toggleTest(t.id)} />
              {t.name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          Add package
        </Button>
      </div>
    </div>
  );
}
