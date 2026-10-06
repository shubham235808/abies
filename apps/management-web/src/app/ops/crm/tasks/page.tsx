import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { errorMessage, enumLabel, formatDateTime, linkWith, personName } from '../_lib/format';
import { TaskDoneButton } from './tasks-actions';

type TaskRow = {
  id: string;
  title: string;
  type: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  lead: { id: string; firstName: string; lastName: string | null } | null;
  assignedTo: { id: string; name: string | null } | null;
};

const VIEWS = [
  { value: 'today', label: 'Today', empty: 'Nothing due today.' },
  { value: 'overdue', label: 'Overdue', empty: 'Nothing overdue. Well done.' },
  { value: 'upcoming', label: 'Upcoming', empty: 'Nothing due later on.' },
  { value: 'completed', label: 'Completed', empty: 'No completed tasks yet.' },
  { value: 'all', label: 'All', empty: 'Nothing due. No tasks yet.' },
] as const;

const PRIORITY_CLASSES: Record<TaskRow['priority'], string> = {
  HIGH: 'bg-brand-magenta-50 text-brand-magenta-800',
  MEDIUM: 'bg-brand-blue-50 text-brand-blue-800',
  LOW: 'bg-brand-neutral-100 text-brand-neutral-700',
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');
  const params = await searchParams;

  const view = VIEWS.find((v) => v.value === params.view) ?? VIEWS[0];
  const page = Math.max(1, Number(params.page) || 1);

  const res = await callDbService<{ tasks: TaskRow[]; total: number; page: number; pageSize: number }>(
    `/db/v1/crm/tasks?view=${view.value}&page=${page}`,
    { sessionToken: token },
  );
  if (res.status === 401) redirect('/ops/login');

  const heading = (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Tasks</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">Calls, follow-ups and meetings for the leads and deals you own.</p>
    </div>
  );

  const tabs = (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Task views">
      {VIEWS.map((v) => (
        <Link
          key={v.value}
          href={linkWith({}, { view: v.value })}
          aria-current={view.value === v.value ? 'page' : undefined}
          className={
            'rounded-full px-3.5 py-1.5 text-sm font-semibold ' +
            (view.value === v.value
              ? 'bg-brand-purple-600 text-white'
              : 'border border-brand-neutral-200 bg-white text-brand-neutral-700 hover:bg-brand-purple-50')
          }
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );

  if (res.status !== 200) {
    return (
      <div>
        {heading}
        {tabs}
        <Alert tone="error" className="mt-4">{errorMessage(res.body, 'Could not load tasks. Try again in a moment.')}</Alert>
      </div>
    );
  }

  const { tasks, total, pageSize } = res.body;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {heading}
      {tabs}

      {tasks.length === 0 ? (
        <div className="mt-4 rounded-control border border-dashed border-brand-neutral-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-brand-neutral-800">{view.empty}</p>
          <p className="mt-1 text-sm text-brand-neutral-500">Tasks you create on a lead or opportunity show up here.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-brand-neutral-100 overflow-hidden rounded-control border border-brand-neutral-100 bg-white">
          {tasks.map((t) => {
            const open = t.status !== 'COMPLETED' && t.status !== 'CANCELLED';
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-brand-neutral-900">{t.title}</div>
                  <div className="mt-0.5 text-sm text-brand-neutral-600">
                    {t.lead ? (
                      <Link href={`/ops/crm/leads/${t.lead.id}`} className="text-brand-purple-700 underline">
                        {personName(t.lead)}
                      </Link>
                    ) : (
                      'No lead'
                    )}
                    {' · '}
                    {enumLabel(t.type)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-brand-neutral-700">
                    {t.status === 'COMPLETED' ? `Done ${formatDateTime(t.completedAt)}` : t.dueAt ? `Due ${formatDateTime(t.dueAt)}` : 'No due time'}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_CLASSES[t.priority]}`}>
                    {enumLabel(t.priority)}
                  </span>
                  {open ? <TaskDoneButton taskId={t.id} /> : <span className="text-xs text-brand-neutral-500">{enumLabel(t.status)}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between text-sm text-brand-neutral-600">
        <span>
          Page {page} of {pages}
        </span>
        <span className="flex gap-3">
          {page > 1 && (
            <Link href={linkWith({ view: view.value }, { page: String(page - 1) })} className="underline">
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={linkWith({ view: view.value }, { page: String(page + 1) })} className="underline">
              Next
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
