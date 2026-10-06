import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Card } from '@abies/design-system/components/ui/card';
import { errorMessage, enumLabel, formatDate, personName } from '../_lib/format';
import { MergeForm } from './merge-form';

type DuplicateLead = {
  id: string;
  firstName: string;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  stage: string;
  createdAt: string;
};

type DuplicateGroup = { matchedOn: 'mobile' | 'email'; leads: DuplicateLead[] };

export default async function DuplicatesPage() {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');

  const res = await callDbService<{ groups: DuplicateGroup[] }>('/db/v1/crm/duplicates', { sessionToken: token });
  if (res.status === 401) redirect('/ops/login');

  const heading = (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Duplicates</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Leads that share a mobile number or email. Merging marks the other lead as a duplicate of the one you keep.
      </p>
    </div>
  );

  if (res.status === 403) {
    return (
      <div>
        {heading}
        <Alert tone="info" className="mt-4">Only CRM administrators can review duplicates.</Alert>
      </div>
    );
  }

  if (res.status !== 200) {
    return (
      <div>
        {heading}
        <Alert tone="error" className="mt-4">{errorMessage(res.body, 'Could not load possible duplicates. Try again in a moment.')}</Alert>
      </div>
    );
  }

  const groups = res.body.groups ?? [];

  return (
    <div>
      {heading}

      {groups.length === 0 ? (
        <div className="mt-4 rounded-control border border-dashed border-brand-neutral-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-brand-neutral-800">No possible duplicates right now.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {groups.map((group, index) => (
            <Card key={`${group.matchedOn}-${group.leads.map((l) => l.id).join('-')}`} className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-neutral-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-brand-neutral-900">
                  Matched on {group.matchedOn === 'mobile' ? 'mobile number' : 'email'}
                </h2>
                <span className="text-xs text-brand-neutral-500">Group {index + 1}</span>
              </div>

              <ul className="divide-y divide-brand-neutral-100">
                {group.leads.map((lead) => (
                  <li key={lead.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <Link href={`/ops/crm/leads/${lead.id}`} className="font-semibold text-brand-purple-700 underline">
                        {personName(lead)}
                      </Link>
                      <p className="truncate text-brand-neutral-600">{lead.mobile ?? lead.email ?? '—'}</p>
                    </div>
                    <div className="flex gap-4 text-brand-neutral-700">
                      <span>{enumLabel(lead.stage)}</span>
                      <span className="text-brand-neutral-500">Created {formatDate(lead.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t border-brand-neutral-100 bg-brand-neutral-50 px-4 py-4">
                <MergeForm leads={group.leads.map((l) => ({ id: l.id, name: personName(l) }))} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
