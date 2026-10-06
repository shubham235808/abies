import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Card } from '@abies/design-system/components/ui/card';
import { enumLabel, errorMessage, formatDate, formatDateTime, formatRupees } from '../../_lib/format';

type Last = { status: string; createdAt: string } | null;

type Customer360 = {
  customer: { id: string; name: string; mobile: string; email: string | null; customerSince: string };
  crm: {
    leadId: string;
    stage: string;
    source: string;
    campaign: string | null;
    owner: string | null;
    openTasks: number;
  } | null;
  healthcare: {
    appointments: {
      total: number;
      upcoming: number;
      last: { scheduledAt: string; status: string } | null;
    };
    panchakarma: { total: number; last: Last };
    diagnostics: { total: number; last: Last };
  };
  commerce: { medicineOrders: { total: number; last: Last } };
  finance: {
    paidCount: number;
    totalPaid: number;
    refundCount: number;
    totalRefunded: number;
    outstanding: number | null;
  };
  support: { open: number; closed: number; last: Last };
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-brand-neutral-900">{title}</h2>
      <div className="mt-3 text-sm text-brand-neutral-800">{children}</div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-brand-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export default async function CustomerSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');
  const { id } = await params;

  const res = await callDbService<Customer360>(`/db/v1/crm/customers/${encodeURIComponent(id)}`, {
    sessionToken: token,
  });
  if (res.status === 401) redirect('/ops/login');
  if (res.status === 404) notFound();

  if (res.status !== 200) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-brand-neutral-900">Customer summary</h1>
        <Alert tone="error" className="mt-4">
          {errorMessage(res.body, 'Could not load this customer. Try again in a moment.')}
        </Alert>
      </div>
    );
  }

  const c = res.body;
  const { appointments, panchakarma, diagnostics } = c.healthcare;
  const { support } = c;
  const hasSupport = support.open + support.closed > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">{c.customer.name}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">Customer summary</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Customer">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2">
            <Row label="Name">{c.customer.name}</Row>
            <Row label="Mobile">{c.customer.mobile}</Row>
            <Row label="Email">{c.customer.email ?? '—'}</Row>
            <Row label="Customer since">{formatDate(c.customer.customerSince)}</Row>
          </dl>
        </Section>

        <Section title="CRM">
          {c.crm ? (
            <>
              <dl className="grid grid-cols-[120px_1fr] gap-y-2">
                <Row label="Stage">{enumLabel(c.crm.stage)}</Row>
                <Row label="Source">{enumLabel(c.crm.source)}</Row>
                <Row label="Campaign">{c.crm.campaign ?? '—'}</Row>
                <Row label="Owner">{c.crm.owner ?? 'Unassigned'}</Row>
                <Row label="Open tasks">{c.crm.openTasks}</Row>
              </dl>
              <Link
                href={`/ops/crm/leads/${encodeURIComponent(c.crm.leadId)}`}
                className="mt-4 inline-block font-medium text-brand-purple-700 hover:underline"
              >
                View lead
              </Link>
            </>
          ) : (
            <p className="text-brand-neutral-500">No CRM lead is linked to this customer.</p>
          )}
        </Section>

        <Section title="Healthcare">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2">
            <Row label="Appointments">
              {appointments.total === 0 ? 'None yet' : `${appointments.total} total, ${appointments.upcoming} upcoming`}
            </Row>
            <Row label="Last appointment">
              {appointments.last
                ? `${formatDateTime(appointments.last.scheduledAt)} · ${enumLabel(appointments.last.status)}`
                : '—'}
            </Row>
            <Row label="Panchakarma">
              {panchakarma.total === 0
                ? 'None yet'
                : `${panchakarma.total} total${panchakarma.last ? ` · last ${enumLabel(panchakarma.last.status)}` : ''}`}
            </Row>
            <Row label="Diagnostics">
              {diagnostics.total === 0
                ? 'None yet'
                : `${diagnostics.total} total${diagnostics.last ? ` · last ${enumLabel(diagnostics.last.status)}` : ''}`}
            </Row>
          </dl>
        </Section>

        <Section title="Commerce">
          {c.commerce.medicineOrders.total === 0 ? (
            <p className="text-brand-neutral-500">No medicine orders yet.</p>
          ) : (
            <dl className="grid grid-cols-[120px_1fr] gap-y-2">
              <Row label="Orders">{c.commerce.medicineOrders.total} total</Row>
              <Row label="Last order">
                {c.commerce.medicineOrders.last
                  ? `${enumLabel(c.commerce.medicineOrders.last.status)} · ${formatDate(c.commerce.medicineOrders.last.createdAt)}`
                  : '—'}
              </Row>
            </dl>
          )}
        </Section>

        <Section title="Finance">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2">
            <Row label="Payments">
              {c.finance.paidCount} · {formatRupees(c.finance.totalPaid)} paid
            </Row>
            <Row label="Refunds">
              {c.finance.refundCount} · {formatRupees(c.finance.totalRefunded)} refunded
            </Row>
            <Row label="Outstanding">
              {c.finance.outstanding === null ? 'Not available yet' : formatRupees(c.finance.outstanding)}
            </Row>
          </dl>
        </Section>

        <Section title="Support">
          {hasSupport ? (
            <dl className="grid grid-cols-[120px_1fr] gap-y-2">
              <Row label="Open tickets">{support.open}</Row>
              <Row label="Closed tickets">{support.closed}</Row>
              <Row label="Last ticket">
                {support.last
                  ? `${enumLabel(support.last.status)} · ${formatDate(support.last.createdAt)}`
                  : '—'}
              </Row>
            </dl>
          ) : (
            <p className="text-brand-neutral-500">No support tickets yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
