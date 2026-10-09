import { Badge, type Tone } from '@abies/design-system/components/ui/badge';
import { DataTable, type DataTableColumn } from '@abies/design-system/components/ui/data-table';

// ENTERPRISE-15 — read-only. This used to be a create/edit form over a
// Postgres NotificationTemplate table that no send path ever read: editing
// a row here changed nothing about what notify()/notifyMailbox() actually
// sent. There is nothing honest left to write, so the form is gone.
//
// What's shown instead is the real, code-registered catalogue
// (packages/domain/src/modules/notifications/templates.ts) that every send
// resolves through, plus — for the one channel where a body we genuinely
// author exists (SMTP/mailer91 email) — its real subject/body. WhatsApp and
// msg91-hosted email are provider-managed: the approved body lives on
// MSG91/Meta's side, named in WHATSAPP_MSG91_TEMPLATE_MAP /
// EMAIL_MSG91_TEMPLATE_ID, not in this database — that's stated plainly
// per row rather than hidden behind a disabled edit button.
export interface NotificationTemplateRow {
  id: string;
  templateKey: string;
  channel: string;
  category: string;
  priority: string;
  routingPolicy: string;
  control: 'CODE' | 'PROVIDER';
  controlNote: string;
  subject?: string;
  body?: string;
}

const CHANNEL_TONE: Record<string, Tone> = {
  EMAIL: 'blue',
  WHATSAPP: 'success',
  IN_APP: 'purple',
};

const COLUMNS: DataTableColumn<NotificationTemplateRow>[] = [
  { key: 'templateKey', label: 'Template key', render: (r) => <span className="font-medium">{r.templateKey}</span> },
  { key: 'channel', label: 'Channel', render: (r) => <Badge tone={CHANNEL_TONE[r.channel] ?? 'neutral'}>{r.channel}</Badge> },
  { key: 'category', label: 'Category', render: (r) => r.category },
  { key: 'priority', label: 'Priority', render: (r) => r.priority },
  { key: 'routingPolicy', label: 'Routing policy', render: (r) => r.routingPolicy.replace(/_/g, ' ') },
  {
    key: 'control',
    label: 'Editable here?',
    render: (r) =>
      r.control === 'CODE' ? (
        <Badge tone="success">Code-controlled</Badge>
      ) : (
        <Badge tone="orange">Provider-managed</Badge>
      ),
  },
  {
    key: 'content',
    label: 'Subject / body',
    render: (r) =>
      r.control === 'CODE' ? (
        <div className="max-w-md space-y-1 text-sm">
          {r.subject && <p className="font-medium text-brand-neutral-800">{r.subject}</p>}
          {r.body && <p className="whitespace-pre-wrap text-brand-neutral-600">{r.body}</p>}
        </div>
      ) : (
        <p className="max-w-md text-sm text-brand-neutral-500">{r.controlNote}</p>
      ),
  },
];

export function NotificationTemplatesManager({ initial }: { initial: NotificationTemplateRow[] }) {
  return (
    <div>
      <p className="text-sm text-brand-neutral-600">
        This is the real notification template catalogue — the one every send actually resolves through. It is
        read-only here: for WhatsApp and for email sent via MSG91 (<code>EMAIL_PROVIDER=msg91</code>, the current
        default in abies-dev and abies-uat), the real body lives on the provider&apos;s side
        (<code>WHATSAPP_MSG91_TEMPLATE_MAP</code> / <code>EMAIL_MSG91_TEMPLATE_ID</code>), not in this app, so there
        is nothing truthful for this screen to let you edit. The only genuinely code-controlled body shown below is
        the SMTP/mailer91 email path.
      </p>
      <DataTable
        columns={COLUMNS}
        rows={initial}
        rowKey={(r) => r.id}
        emptyMessage="No notification templates registered."
      />
    </div>
  );
}
