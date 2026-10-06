import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { errorMessage, enumLabel } from '../_lib/format';

type AuditEvent = {
  id: string;
  eventType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  metadata: unknown;
  createdAt: string;
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

// Shows the keys the row actually has. Long text is cut short, nested values are counted, never dumped.
function metadataSummary(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  return Object.entries(metadata as Record<string, unknown>).map(([key, value]) => {
    const label = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return `${label}: ${shortValue(value)}`;
  });
}

function shortValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 40 ? `${value.slice(0, 39)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return 'details';
}

export default async function AuditPage() {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');

  const res = await callDbService<{ events: AuditEvent[] }>('/db/v1/crm/audit', { sessionToken: token });
  if (res.status === 401) redirect('/ops/login');

  const heading = (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Audit log</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Recent CRM changes, exports and merges, newest first.</p>
    </div>
  );

  if (res.status === 403) {
    return (
      <div>
        {heading}
        <Alert tone="info" className="mt-4">Only auditors and CRM administrators can read the CRM audit log.</Alert>
      </div>
    );
  }

  if (res.status !== 200) {
    return (
      <div>
        {heading}
        <Alert tone="error" className="mt-4">{errorMessage(res.body, 'Could not load the audit log. Try again in a moment.')}</Alert>
      </div>
    );
  }

  const events = res.body.events ?? [];

  if (events.length === 0) {
    return (
      <div>
        {heading}
        <div className="mt-4 rounded-control border border-dashed border-brand-neutral-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-brand-neutral-800">No CRM activity recorded yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {heading}

      <div className="mt-4 overflow-x-auto rounded-control border border-brand-neutral-100 bg-white">
        <table className="min-w-full divide-y divide-brand-neutral-100 text-sm">
          <thead className="bg-brand-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-neutral-600">
            <tr>
              <th scope="col" className="px-4 py-3">Time</th>
              <th scope="col" className="px-4 py-3">Event type</th>
              <th scope="col" className="px-4 py-3">Action</th>
              <th scope="col" className="px-4 py-3">Record ID</th>
              <th scope="col" className="px-4 py-3">User ID</th>
              <th scope="col" className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-neutral-100">
            {events.map((e) => {
              const details = metadataSummary(e.metadata);
              return (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-brand-neutral-700">
                    {new Date(e.createdAt).toLocaleString('en-IN', TIME_FORMAT)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-brand-neutral-900">{enumLabel(e.eventType)}</td>
                  <td className="px-4 py-3 text-brand-neutral-700">{enumLabel(e.action)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-neutral-600 break-all">{e.resourceId ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-neutral-600 break-all">{e.userId ?? '—'}</td>
                  <td className="px-4 py-3 text-brand-neutral-700">
                    {details.length === 0 ? (
                      <span className="text-brand-neutral-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {details.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
