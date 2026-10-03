'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@abies/design-system/components/ui/button';
import { DataTable, type DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { Modal } from '@abies/design-system/components/ui/modal';
import { ConfirmationDialog } from '@abies/design-system/components/ui/confirmation-dialog';
import { useToast } from '@abies/design-system/components/ui/toast';
import { api, ApiError } from '@abies/design-system/api-client';

// Shared CRUD chrome for every ENTERPRISE-2 configuration domain (docs/
// ENTERPRISE-IMPLEMENTATION-PLAN.md's ENTERPRISE-2) — list, add-via-modal,
// active/inactive toggle, remove-with-confirmation, toast feedback. Each
// domain's own fields differ too much for a fully generic form (city/state/
// pinCodes vs. templateKey/channel/body), so only the chrome is shared;
// each manager below supplies its own columns and add-form JSX.
export function ConfigManagerShell<T extends { id: string; active: boolean }>({
  columns,
  initialRows,
  apiBase,
  addModalTitle,
  renderAddForm,
  deleteConfirmDescription,
  entityLabel,
}: {
  columns: DataTableColumn<T>[];
  initialRows: T[];
  apiBase: string;
  addModalTitle: string;
  renderAddForm: (props: { onCreated: (row: T) => void; onCancel: () => void }) => ReactNode;
  deleteConfirmDescription?: string;
  entityLabel: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`${apiBase}/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.show(`${entityLabel} removed.`, 'info');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : `Could not remove this ${entityLabel.toLowerCase()}.`, 'danger');
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  async function handleToggleActive(row: T) {
    try {
      const result = await api.patch<Record<string, T>>(`${apiBase}/${row.id}`, { active: !row.active });
      const updated = Object.values(result)[0] as T;
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not update.', 'danger');
    }
  }

  const fullColumns: DataTableColumn<T>[] = [
    ...columns,
    {
      key: 'active',
      label: 'Status',
      render: (r) => (
        <button type="button" onClick={() => handleToggleActive(r)} className="text-xs font-medium text-brand-purple-600 hover:underline">
          {r.active ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(r.id)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          + Add
        </Button>
      </div>
      <DataTable columns={fullColumns} rows={rows} rowKey={(r) => r.id} emptyMessage={`No ${entityLabel.toLowerCase()}s configured yet.`} />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={addModalTitle}>
        {renderAddForm({
          onCreated: (row) => {
            setRows((prev) => [row, ...prev]);
            setAddOpen(false);
            toast.show(`${entityLabel} added.`, 'success');
          },
          onCancel: () => setAddOpen(false),
        })}
      </Modal>

      <ConfirmationDialog
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => pendingDeleteId && handleDelete(pendingDeleteId)}
        title={`Remove this ${entityLabel.toLowerCase()}?`}
        description={deleteConfirmDescription}
        confirmLabel="Remove"
        tone="danger"
        busy={deleting}
      />
    </div>
  );
}
