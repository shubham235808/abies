'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import type { DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { api, ApiError } from '@abies/design-system/api-client';
import { ConfigManagerShell } from './config-manager-shell';

export interface NotificationTemplateRow {
  id: string;
  templateKey: string;
  channel: string;
  subject: string | null;
  body: string;
  active: boolean;
}

const CHANNELS = ['IN_APP', 'EMAIL', 'WHATSAPP', 'PUSH'];

const COLUMNS: DataTableColumn<NotificationTemplateRow>[] = [
  { key: 'templateKey', label: 'Template key', render: (r) => r.templateKey },
  { key: 'channel', label: 'Channel', render: (r) => <Badge tone="blue">{r.channel}</Badge> },
  { key: 'subject', label: 'Subject', render: (r) => r.subject ?? '—' },
];

export function NotificationTemplatesManager({ initial }: { initial: NotificationTemplateRow[] }) {
  return (
    <ConfigManagerShell
      columns={COLUMNS}
      initialRows={initial}
      apiBase="/api/v1/admin/configuration/notification-templates"
      addModalTitle="Add a notification template"
      entityLabel="Template"
      deleteConfirmDescription="Any notification already queued or sent using this template is unaffected — this only removes it from future use."
      renderAddForm={({ onCreated, onCancel }) => <AddForm onCreated={onCreated} onCancel={onCancel} />}
    />
  );
}

function AddForm({ onCreated, onCancel }: { onCreated: (row: NotificationTemplateRow) => void; onCancel: () => void }) {
  const [templateKey, setTemplateKey] = useState('');
  const [channel, setChannel] = useState(CHANNELS[0]!);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { template } = await api.post<{ template: NotificationTemplateRow }>('/api/v1/admin/configuration/notification-templates', {
        templateKey,
        channel,
        subject: subject || undefined,
        body,
      });
      onCreated(template);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this template.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="nt-key">Template key</Label>
        <Input id="nt-key" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} placeholder="appointment.reminder" />
      </div>
      <div>
        <Label htmlFor="nt-channel">Channel</Label>
        <Select id="nt-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="nt-subject">Subject (optional)</Label>
        <Input id="nt-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="nt-body">Body</Label>
        <Textarea id="nt-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!templateKey || !body} onClick={handleSubmit}>
          Add
        </Button>
      </div>
    </div>
  );
}
