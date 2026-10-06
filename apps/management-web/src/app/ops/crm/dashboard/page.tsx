import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Card } from '@abies/design-system/components/ui/card';
import { errorMessage, formatRupees } from '../_lib/format';

type Dashboard = {
  leadsByStage: Record<string, number>;
  leadsTotal: number;
  pipeline: { openCount: number; weightedValue: number };
  won: { count: number; value: number };
  tasks: { overdue: number; dueToday: number };
};

function KpiCard({ href, label, value, hint }: { href: string; label: string; value: string; hint?: string }) {
  return (
    <Link href={href} className="block rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple-500">
      <Card className="h-full p-5 transition hover:border-brand-purple-200 hover:shadow-brand">
        <p className="text-sm font-medium text-brand-neutral-600">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-brand-neutral-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-brand-neutral-500">{hint}</p>}
      </Card>
    </Link>
  );
}

export default async function CrmDashboardPage() {
  const token = await sessionTokenFromCookies();
  if (!token) redirect('/ops/login');

  const res = await callDbService<Dashboard>('/db/v1/crm/dashboard', { sessionToken: token });
  if (res.status === 401) redirect('/ops/login');

  if (res.status !== 200) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-brand-neutral-900">Dashboard</h1>
        <Alert tone="error" className="mt-4">
          {errorMessage(res.body, 'Could not load the CRM dashboard. Try again in a moment.')}
        </Alert>
      </div>
    );
  }

  const d = res.body;
  const newLeads = d.leadsByStage.NEW ?? 0;
  const converted = d.leadsByStage.CONVERTED ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Dashboard</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">A snapshot of the leads, pipeline and tasks you can see.</p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-brand-neutral-500">Leads</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          href="/ops/crm/leads"
          label="Leads"
          value={String(d.leadsTotal)}
          hint={d.leadsTotal === 0 ? 'No leads yet. New enquiries will appear here.' : 'All leads you can see'}
        />
        <KpiCard
          href="/ops/crm/leads?stage=NEW"
          label="New leads"
          value={String(newLeads)}
          hint={newLeads === 0 ? 'No new leads waiting.' : 'Not yet contacted'}
        />
        <KpiCard
          href="/ops/crm/leads?stage=CONVERTED"
          label="Converted"
          value={String(converted)}
          hint={converted === 0 ? 'No leads converted yet.' : 'Leads that became patients or customers'}
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-brand-neutral-500">Opportunities</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          href="/ops/crm/opportunities"
          label="Open opportunities"
          value={String(d.pipeline.openCount)}
          hint={d.pipeline.openCount === 0 ? 'No open opportunities. Create one to track value.' : 'Currently in progress'}
        />
        <KpiCard
          href="/ops/crm/opportunities"
          label="Weighted pipeline"
          value={formatRupees(d.pipeline.weightedValue)}
          hint={d.pipeline.openCount === 0 ? 'Nothing in the pipeline yet.' : 'Value x probability, open deals'}
        />
        <KpiCard
          href="/ops/crm/opportunities?status=WON"
          label="Won"
          value={String(d.won.count)}
          hint={d.won.count === 0 ? 'No deals won yet.' : `${formatRupees(d.won.value)} won in total`}
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-brand-neutral-500">Tasks</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <KpiCard
          href="/ops/crm/tasks?view=overdue"
          label="Overdue tasks"
          value={String(d.tasks.overdue)}
          hint={d.tasks.overdue === 0 ? 'Nothing overdue.' : 'Past their due time'}
        />
        <KpiCard
          href="/ops/crm/tasks?view=today"
          label="Due today"
          value={String(d.tasks.dueToday)}
          hint={d.tasks.dueToday === 0 ? 'Nothing due today.' : 'Due before midnight'}
        />
      </div>
    </div>
  );
}
