import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { errorMessage, enumLabel } from '../_lib/format';
import { RunIdleCheckButton, ToggleRuleButton } from './rule-actions';

type Condition = { field: string; op: string; value: string };

type ActionConfig =
  | { type: 'ASSIGN_TO_USER'; userId: string }
  | { type: 'CREATE_TASK'; title: string; dueInMinutes: number }
  | { type: 'NOTIFY_OWNER'; message: string }
  | { type: 'SET_PRIORITY'; priority: 'LOW' | 'MEDIUM' | 'HIGH' };

type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: 'LEAD_CREATED' | 'LEAD_IDLE';
  conditions: Condition[];
  action: ActionConfig['type'];
  actionConfig: ActionConfig;
  _count: { executions: number };
  createdAt: string;
};

type Assignee = { id: string; name: string | null; mobile: string };

const FIELD_LABELS: Record<string, string> = {
  source: 'Source',
  city: 'City',
  interestedService: 'Interested service',
  priority: 'Priority',
  stage: 'Stage',
};

const TRIGGER_LABELS: Record<RuleRow['trigger'], string> = {
  LEAD_CREATED: 'When a lead is created',
  LEAD_IDLE: 'When a lead has no contact for 48 hours',
};

function conditionText(c: Condition): string {
  const field = FIELD_LABELS[c.field] ?? enumLabel(c.field);
  const op = c.op === 'contains' ? 'contains' : 'is';
  return `${field} ${op} ${c.value}`;
}

function actionText(config: ActionConfig, assignees: Map<string, string>): string {
  switch (config.type) {
    case 'ASSIGN_TO_USER':
      return `Assign to ${assignees.get(config.userId) ?? 'a team member'}`;
    case 'CREATE_TASK':
      return `Create task "${config.title}", due in ${config.dueInMinutes} min`;
    case 'NOTIFY_OWNER':
      return `Notify the lead owner: "${config.message}"`;
    case 'SET_PRIORITY':
      return `Set priority to ${enumLabel(config.priority)}`;
    default:
      return enumLabel((config as { type: string }).type);
  }
}

export default async function AutomationPage() {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');

  const res = await callDbService<{ rules: RuleRow[] }>('/db/v1/crm/automation/rules', { sessionToken: token });
  if (res.status === 401) redirect('/ops/login');

  // Names for assignee actions. If this fails, the actions still show, with a generic label.
  const assigneeNames = new Map<string, string>();
  if (res.status === 200) {
    const people = await callDbService<{ users: Assignee[] }>('/db/v1/crm/assignees', { sessionToken: token }).catch(() => null);
    if (people?.status === 200) {
      for (const u of people.body.users ?? []) assigneeNames.set(u.id, u.name ?? u.mobile);
    }
  }

  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-brand-neutral-900">Automation</h1>
        <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
          Rules run when a lead is created, or when a lead has had no contact for 48 hours (run by &lsquo;Run idle check&rsquo;).
        </p>
      </div>
      {res.status === 200 && (
        <div className="flex flex-wrap gap-3">
          <RunIdleCheckButton />
          <Link
            href="/ops/crm/automation/new"
            className="inline-flex items-center justify-center rounded-control bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 px-[18px] py-3 text-sm font-bold text-white hover:-translate-y-px"
          >
            New rule
          </Link>
        </div>
      )}
    </div>
  );

  if (res.status === 403) {
    return (
      <div>
        {heading}
        <Alert tone="info" className="mt-4">Only CRM administrators can manage automation.</Alert>
      </div>
    );
  }

  if (res.status !== 200) {
    return (
      <div>
        {heading}
        <Alert tone="error" className="mt-4">{errorMessage(res.body, 'Could not load automation rules. Try again in a moment.')}</Alert>
      </div>
    );
  }

  const { rules } = res.body;

  return (
    <div>
      {heading}

      {rules.length === 0 ? (
        <div className="mt-4 rounded-control border border-dashed border-brand-neutral-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-brand-neutral-800">No rules yet.</p>
          <p className="mt-1 text-sm text-brand-neutral-500">Create a rule to assign, remind or update leads automatically.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-control border border-brand-neutral-100 bg-white">
          <table className="min-w-full divide-y divide-brand-neutral-100 text-sm">
            <thead className="bg-brand-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Trigger</th>
                <th scope="col" className="px-4 py-3">Conditions</th>
                <th scope="col" className="px-4 py-3">Action</th>
                <th scope="col" className="px-4 py-3">Enabled</th>
                <th scope="col" className="px-4 py-3 text-right">Runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral-100">
              {rules.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3 font-semibold text-brand-neutral-900">{r.name}</td>
                  <td className="px-4 py-3 text-brand-neutral-700">{TRIGGER_LABELS[r.trigger] ?? enumLabel(r.trigger)}</td>
                  <td className="px-4 py-3 text-brand-neutral-700">
                    {r.conditions.length === 0 ? (
                      <span className="text-brand-neutral-500">Every lead</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.conditions.map((c, i) => (
                          <li key={i}>{conditionText(c)}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-neutral-700">{actionText(r.actionConfig, assigneeNames)}</td>
                  <td className="px-4 py-3">
                    <ToggleRuleButton ruleId={r.id} enabled={r.enabled} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-brand-neutral-700">{r._count.executions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
