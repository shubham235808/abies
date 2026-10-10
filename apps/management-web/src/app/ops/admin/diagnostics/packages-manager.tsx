'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';

type Lab = { id: string; name: string | null };
type TestOption = { id: string; name: string; labId: string; active: boolean };
type Package = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  lab: Lab;
  tests: { test: { id: string; name: string } }[];
};

// Direct pattern reuse of partner-web's packages-manager.tsx, plus the lab
// picker: a package is bundled from one lab's own tests, so the test
// checklist is filtered to whichever lab is selected.
type PackageRow = Omit<Package, 'lab'>;

export function PackagesManager({ labs, allTests, initial }: { labs: Lab[]; allTests: TestOption[]; initial: Package[] }) {
  const [packages, setPackages] = useState(initial);
  const [modal, setModal] = useState<'create' | { edit: Package } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(pkg: Package) {
    setError(null);
    try {
      const { package: updated } = await api.patch<{ package: PackageRow }>(`/api/v1/admin/diagnostics/packages/${pkg.id}`, {
        active: !pkg.active,
      });
      setPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, ...updated } : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this package.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/diagnostics/packages/${id}`);
      setPackages((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this package.');
    }
  }

  return (
    <div className="max-w-3xl">
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
                  <span className="text-xs text-brand-neutral-400">· {p.lab.name ?? 'Unnamed lab'}</span>
                </div>
                <p className="mt-1 text-xs text-brand-neutral-400">{p.tests.map((t) => t.test.name).join(', ')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setModal({ edit: p })}>
                  Edit
                </Button>
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
        {packages.length === 0 && <p className="text-sm text-brand-neutral-500">No packages yet.</p>}
      </div>

      {labs.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">Approve a lab before adding packages for it.</p>
      ) : (
        <Button variant="secondary" className="mt-6" onClick={() => setModal('create')}>
          + Add package
        </Button>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'New package' : 'Edit package'}>
        {modal === 'create' && (
          <PackageForm
            labs={labs}
            allTests={allTests}
            existing={null}
            onSaved={(pkg) => {
              setPackages((prev) => [pkg, ...prev]);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
        {modal !== null && modal !== 'create' && (
          <PackageForm
            labs={labs}
            allTests={allTests}
            existing={modal.edit}
            onSaved={(pkg) => {
              setPackages((prev) => prev.map((p) => (p.id === pkg.id ? pkg : p)));
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function PackageForm({
  labs,
  allTests,
  existing,
  onSaved,
  onCancel,
}: {
  labs: Lab[];
  allTests: TestOption[];
  existing: Package | null;
  onSaved: (pkg: Package) => void;
  onCancel: () => void;
}) {
  const [labId, setLabId] = useState(existing?.lab.id ?? labs[0]?.id ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>(existing?.tests.map((t) => t.test.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already-bundled tests stay visible even if deactivated, so an admin
  // can see what's in the package before deciding whether to drop it.
  const labTests = allTests.filter((t) => t.labId === labId && (t.active || selectedTestIds.includes(t.id)));

  function toggleTest(id: string) {
    setSelectedTestIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!name || !price || selectedTestIds.length === 0 || !labId) {
      setError('Lab, name, price, and at least one test are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        const { package: updated } = await api.patch<{ package: PackageRow }>(`/api/v1/admin/diagnostics/packages/${existing.id}`, {
          name,
          description: description || undefined,
          price: Number(price),
          active,
          testIds: selectedTestIds,
        });
        onSaved({ ...existing, ...updated, lab: existing.lab });
      } else {
        const { package: created } = await api.post<{ package: PackageRow }>('/api/v1/admin/diagnostics/packages', {
          labId,
          name,
          description: description || undefined,
          price: Number(price),
          testIds: selectedTestIds,
        });
        const lab = labs.find((l) => l.id === labId) ?? { id: labId, name: null };
        onSaved({ ...created, lab });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this package.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {existing ? (
        <p className="text-sm text-brand-neutral-500">Lab: {existing.lab.name ?? existing.lab.id} (fixed — remove and re-add under a different lab if this was wrong)</p>
      ) : (
        <div>
          <Label htmlFor="pkg-lab">Lab</Label>
          <Select
            id="pkg-lab"
            value={labId}
            onChange={(e) => {
              setLabId(e.target.value);
              setSelectedTestIds([]);
            }}
          >
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name ?? l.id}
              </option>
            ))}
          </Select>
        </div>
      )}
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
        <Label>Included tests (this lab&apos;s catalogue)</Label>
        {labTests.length === 0 ? (
          <p className="mt-1 text-sm text-brand-neutral-500">This lab has no tests yet — add one under the Tests tab first.</p>
        ) : (
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {labTests.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-brand-neutral-700">
                <input type="checkbox" checked={selectedTestIds.includes(t.id)} onChange={() => toggleTest(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </div>
      {existing && (
        <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      )}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Add package'}
        </Button>
      </div>
    </div>
  );
}
