'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';

const MAX_CONDITIONS = 5;
const FIELDS = [
  { value: 'source', label: 'Source' },
  { value: 'city', label: 'City' },
  { value: 'interestedService', label: 'Interested service' },
  { value: 'priority', label: 'Priority' },
  { value: 'stage', label: 'Stage' },
] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

type Assignee = { id: string; name: string | null; mobile: string; role: string };
type ConditionDraft = { key: number; field: string; op: 'equals' | 'contains'; value: string };
type ActionType = 'ASSIGN_TO_USER' | 'CREATE_TASK' | 'NOTIFY_OWNER' | 'SET_PRIORITY';

export function CreateRuleForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<'LEAD_CREATED' | 'LEAD_IDLE'>('LEAD_CREATED');
  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [actionType, setActionType] = useState<ActionType>('ASSIGN_TO_USER');
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [dueInMinutes, setDueInMinutes] = useState('60');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('HIGH');
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/v1/crm/assignees', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load team members.');
        return r.json();
      })
      .then((b) => setAssignees(b.users ?? []))
      .catch((err) => setAssigneeError(err instanceof Error ? err.message : 'Could not load team members.'));
  }, []);

  function updateCondition(key: number, changes: Partial<ConditionDraft>) {
    setConditions((list) => list.map((c) => (c.key === key ? { ...c, ...changes } : c)));
  }

  function addCondition() {
    setConditions((list) => [...list, { key: nextKey, field: 'source', op: 'equals', value: '' }]);
    setNextKey((k) => k + 1);
  }

  function removeCondition(key: number) {
    setConditions((list) => list.filter((c) => c.key !== key));
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Enter a name for this rule.';
    conditions.forEach((c, i) => {
      if (!c.value.trim()) errors[`condition-${c.key}`] = `Enter a value for condition ${i + 1}.`;
    });
    if (actionType === 'ASSIGN_TO_USER' && !userId) errors.userId = 'Choose a team member to assign to.';
    if (actionType === 'CREATE_TASK') {
      if (!title.trim()) errors.title = 'Enter a task title.';
      const minutes = Number(dueInMinutes);
      if (!dueInMinutes.trim() || !Number.isInteger(minutes) || minutes < 1) {
        errors.dueInMinutes = 'Enter a whole number of minutes, at least 1.';
      }
    }
    if (actionType === 'NOTIFY_OWNER' && !message.trim()) errors.message = 'Enter a message for the lead owner.';
    return errors;
  }

  function buildActionConfig() {
    switch (actionType) {
      case 'ASSIGN_TO_USER':
        return { type: 'ASSIGN_TO_USER', userId };
      case 'CREATE_TASK':
        return { type: 'CREATE_TASK', title: title.trim(), dueInMinutes: Number(dueInMinutes) };
      case 'NOTIFY_OWNER':
        return { type: 'NOTIFY_OWNER', message: message.trim() };
      case 'SET_PRIORITY':
        return { type: 'SET_PRIORITY', priority };
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const res = await fetch('/api/v1/crm/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          trigger,
          conditions: conditions.map((c) => ({ field: c.field, op: c.op, value: c.value.trim() })),
          actionConfig: buildActionConfig(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = Array.isArray(body?.issues) ? body.issues[0]?.message : undefined;
        throw new Error(first ?? body?.error ?? 'Could not create this rule.');
      }
      router.push('/ops/crm/automation');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this rule.');
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) =>
    fieldErrors[key] ? <p role="alert" className="mt-1.5 text-sm text-brand-magenta-600">{fieldErrors[key]}</p> : null;

  return (
    <Card className="mt-4 p-5">
      <form onSubmit={handleSubmit} noValidate className="grid gap-6">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Rule name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Assign Agra leads to the Agra team"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldError('name')}
          </div>
          <div>
            <Label htmlFor="trigger">When</Label>
            <Select id="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)}>
              <option value="LEAD_CREATED">A lead is created</option>
              <option value="LEAD_IDLE">A lead has no contact for 48 hours</option>
            </Select>
          </div>
        </div>

        <section aria-labelledby="conditions-heading" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="conditions-heading" className="text-sm font-semibold text-brand-neutral-900">
              Conditions <span className="font-normal text-brand-neutral-500">(all must match, up to {MAX_CONDITIONS})</span>
            </h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={addCondition}
              disabled={conditions.length >= MAX_CONDITIONS}
            >
              Add condition
            </Button>
          </div>

          {conditions.length === 0 && (
            <p className="text-sm text-brand-neutral-500">No conditions. The rule applies to every lead.</p>
          )}

          {conditions.map((c, i) => (
            <div key={c.key} className="grid gap-3 rounded-lg border border-brand-neutral-100 p-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
              <div>
                <Label htmlFor={`field-${c.key}`}>Field {i + 1}</Label>
                <Select
                  id={`field-${c.key}`}
                  value={c.field}
                  onChange={(e) => updateCondition(c.key, { field: e.target.value })}
                >
                  {FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`op-${c.key}`}>Operator</Label>
                <Select
                  id={`op-${c.key}`}
                  value={c.op}
                  onChange={(e) => updateCondition(c.key, { op: e.target.value as ConditionDraft['op'] })}
                >
                  <option value="equals">is</option>
                  <option value="contains">contains</option>
                </Select>
              </div>
              <div>
                <Label htmlFor={`value-${c.key}`}>Value</Label>
                <Input
                  id={`value-${c.key}`}
                  value={c.value}
                  onChange={(e) => updateCondition(c.key, { value: e.target.value })}
                  placeholder={c.field === 'city' ? 'Agra' : 'WEBSITE'}
                  aria-invalid={Boolean(fieldErrors[`condition-${c.key}`])}
                />
                {fieldError(`condition-${c.key}`)}
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeCondition(c.key)} aria-label={`Remove condition ${i + 1}`}>
                Remove
              </Button>
            </div>
          ))}
        </section>

        <section aria-labelledby="action-heading" className="grid gap-4 sm:grid-cols-2">
          <h2 id="action-heading" className="text-sm font-semibold text-brand-neutral-900 sm:col-span-2">
            Action
          </h2>
          <div className="sm:col-span-2">
            <Label htmlFor="actionType">Do this</Label>
            <Select id="actionType" value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
              <option value="ASSIGN_TO_USER">Assign the lead to a team member</option>
              <option value="CREATE_TASK">Create a task</option>
              <option value="NOTIFY_OWNER">Send a message to the lead owner</option>
              <option value="SET_PRIORITY">Set the lead priority</option>
            </Select>
          </div>

          {actionType === 'ASSIGN_TO_USER' && (
            <div className="sm:col-span-2">
              <Label htmlFor="userId">Team member</Label>
              <Select
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                aria-invalid={Boolean(fieldErrors.userId)}
              >
                <option value="">Choose a team member</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? a.mobile} ({a.role.replaceAll('_', ' ').toLowerCase()})
                  </option>
                ))}
              </Select>
              {assigneeError && <p className="mt-1.5 text-sm text-brand-magenta-600">{assigneeError}</p>}
              {fieldError('userId')}
            </div>
          )}

          {actionType === 'CREATE_TASK' && (
            <>
              <div className="sm:col-span-2">
                <Label htmlFor="title">Task title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Call the lead"
                  aria-invalid={Boolean(fieldErrors.title)}
                />
                {fieldError('title')}
              </div>
              <div>
                <Label htmlFor="dueInMinutes">Due in (minutes)</Label>
                <Input
                  id="dueInMinutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={dueInMinutes}
                  onChange={(e) => setDueInMinutes(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.dueInMinutes)}
                />
                {fieldError('dueInMinutes')}
              </div>
            </>
          )}

          {actionType === 'NOTIFY_OWNER' && (
            <div className="sm:col-span-2">
              <Label htmlFor="message">Message</Label>
              <Input
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="This lead has not been contacted in 48 hours"
                aria-invalid={Boolean(fieldErrors.message)}
              />
              {fieldError('message')}
            </div>
          )}

          {actionType === 'SET_PRIORITY' && (
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy}>
            Create rule
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push('/ops/crm/automation')} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
