'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { SupportTicketPriorityBadge, SupportTicketStatusBadge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';

export interface ThreadMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; mobile: string; role: string } | null;
}

export interface RefundablePayment {
  id: string;
  purpose: string;
  amount: number;
  status: string;
  createdAt: string;
  refunds: { id: string; amount: number; status: string }[];
}

export interface TicketDetail {
  id: string;
  subject: string;
  description: string;
  category: string;
  department: string;
  priority: string;
  status: string;
  channel: string;
  createdAt: string;
  requester: { id: string; mobile: string; role: string };
  linkedPatient: { id: string; mobile: string; patientProfile: { firstName: string | null; lastName: string | null } | null } | null;
  assignedAgent: { id: string; mobile: string } | null;
  messages: ThreadMessage[];
  refundablePayments?: RefundablePayment[];
}

const STATUS_OPTIONS = ['IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'RESOLVED', 'CLOSED'];
const DEPARTMENT_OPTIONS = ['CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATION'];
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'P4'];

// Same lesson as every other portal's *-actions.tsx client component
// (Phases 7-9): every mutation here updates this component's own state
// directly from that call's response, never by hoping a server re-render
// resets props.
export function TicketThread({ ticket: initialTicket, viewerRole }: { ticket: TicketDetail; viewerRole: string }) {
  const viewerIsStaff = viewerRole !== 'PATIENT';
  const canHandleRefunds = viewerRole === 'CUSTOMER_SUPPORT' || viewerRole === 'ADMIN';
  // ENTERPRISE-9 — same role scope as refund handling; Sales/Tech Support/
  // Care Coordination don't get a generic "browse everything about this
  // patient" view, matching least-privilege (docs/ENTERPRISE-GAP-ANALYSIS.md §71).
  const canView360 = viewerRole === 'CUSTOMER_SUPPORT' || viewerRole === 'ADMIN';
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState(initialTicket.messages);
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState(STATUS_OPTIONS[0]);
  const [department, setDepartment] = useState(ticket.department);
  const [priority, setPriority] = useState(ticket.priority);
  const [refundablePayments, setRefundablePayments] = useState(initialTicket.refundablePayments ?? []);
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patientName = ticket.linkedPatient
    ? [ticket.linkedPatient.patientProfile?.firstName, ticket.linkedPatient.patientProfile?.lastName].filter(Boolean).join(' ') ||
      ticket.linkedPatient.mobile
    : null;

  async function handleClaim() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ ticket: TicketDetail }>(`/api/support/tickets/${ticket.id}/claim`, {});
      setTicket((prev) => ({ ...prev, ...result.ticket }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not claim this ticket.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTriage() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ ticket: TicketDetail }>(`/api/support/tickets/${ticket.id}/triage`, { department, priority });
      setTicket((prev) => ({ ...prev, ...result.ticket }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update triage.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ ticket: TicketDetail }>(`/api/support/tickets/${ticket.id}/status`, { status: nextStatus });
      setTicket((prev) => ({ ...prev, ...result.ticket }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestRefund(paymentId: string, remaining: number) {
    const raw = refundAmounts[paymentId];
    const amount = raw ? Number(raw) : remaining;
    if (!amount || amount <= 0 || amount > remaining) {
      setError(`Enter an amount up to the refundable balance (₹${remaining})`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/refunds', { paymentId, amount });
      setRefundablePayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, refunds: [...p.refunds, { id: 'pending', amount, status: 'REQUESTED' }] } : p)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not request this refund.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReply() {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ message: ThreadMessage }>(`/api/support/tickets/${ticket.id}/messages`, { body: reply });
      setMessages((prev) => [...prev, result.message]);
      setReply('');
      if (ticket.status === 'RESOLVED' || ticket.status === 'WAITING_CUSTOMER' || ticket.status === 'OPEN') {
        setTicket((prev) => ({ ...prev, status: viewerIsStaff ? prev.status : 'IN_PROGRESS' }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that reply.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-brand-neutral-600">
            {ticket.category.replace(/_/g, ' ')} · {ticket.department.replace(/_/g, ' ')} · from {ticket.requester.mobile}
            {patientName ? ` · patient: ${patientName}` : ''}
            {canView360 && ticket.linkedPatient && (
              <>
                {' · '}
                <Link href={`/customer-support/customers/${ticket.linkedPatient.id}`} className="font-medium text-brand-purple-600 underline">
                  View customer 360
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <SupportTicketPriorityBadge priority={ticket.priority} />
          <SupportTicketStatusBadge status={ticket.status} />
        </div>
      </div>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <Card className="mt-4">
        <p className="text-sm text-brand-neutral-700">{ticket.description}</p>
        <p className="mt-2 text-xs text-brand-neutral-400">
          Opened {new Date(ticket.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} via{' '}
          {ticket.channel.replace(/_/g, ' ')}
        </p>
      </Card>

      {viewerIsStaff && (
        <Card className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-brand-neutral-600">
              Assigned to: {ticket.assignedAgent ? ticket.assignedAgent.mobile : <span className="text-brand-neutral-400">unassigned</span>}
            </p>
            {!ticket.assignedAgent && (
              <Button size="sm" variant="secondary" loading={busy} onClick={handleClaim}>
                Claim ticket
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-brand-neutral-100 pt-4">
            <div>
              <Label htmlFor="department">Department</Label>
              <Select id="department" value={department} onChange={(e) => setDepartment(e.target.value)}>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button size="sm" variant="secondary" loading={busy} onClick={handleTriage}>
            Update triage
          </Button>

          <div className="flex flex-wrap items-end gap-3 border-t border-brand-neutral-100 pt-4">
            <div>
              <Label htmlFor="status">Change status</Label>
              <Select id="status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" loading={busy} onClick={handleStatus}>
              Apply
            </Button>
          </div>
        </Card>
      )}

      {canHandleRefunds && refundablePayments.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-semibold text-brand-neutral-900">Patient&apos;s payments</h2>
          <ul className="mt-3 space-y-3">
            {refundablePayments.map((p) => {
              const committed = p.refunds
                .filter((r) => r.status !== 'REJECTED')
                .reduce((sum, r) => sum + r.amount, 0);
              const remaining = p.amount - committed;
              return (
                <li key={p.id} className="rounded-lg border border-brand-neutral-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-brand-neutral-700">
                      {p.purpose.replace(/_/g, ' ')} — ₹{p.amount} ({p.status.replace(/_/g, ' ')})
                    </span>
                    <span className="text-xs text-brand-neutral-400">
                      {new Date(p.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  {p.refunds.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-brand-neutral-500">
                      {p.refunds.map((r) => (
                        <li key={r.id}>
                          Refund of ₹{r.amount} — {r.status}
                        </li>
                      ))}
                    </ul>
                  )}
                  {remaining > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={remaining}
                        placeholder={`Up to ₹${remaining}`}
                        value={refundAmounts[p.id] ?? ''}
                        onChange={(e) => setRefundAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-32"
                      />
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => handleRequestRefund(p.id, remaining)}>
                        Request refund
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="font-semibold text-brand-neutral-900">Conversation</h2>
        <ul className="mt-3 space-y-3">
          {messages.length === 0 && <li className="text-sm text-brand-neutral-400">No replies yet.</li>}
          {messages.map((m) => (
            <li key={m.id} className="rounded-lg border border-brand-neutral-100 p-3">
              <p className="text-sm text-brand-neutral-700">{m.body}</p>
              <p className="mt-1 text-xs text-brand-neutral-400">
                {m.author ? m.author.mobile : 'System'} ·{' '}
                {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </li>
          ))}
        </ul>

        {ticket.status !== 'CLOSED' ? (
          <div className="mt-4 space-y-2 border-t border-brand-neutral-100 pt-4">
            <Label htmlFor="reply">Reply</Label>
            <Textarea id="reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
            <Button loading={busy} onClick={handleReply}>
              Send reply
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-brand-neutral-500">This ticket is closed.</p>
        )}
      </Card>
    </div>
  );
}
