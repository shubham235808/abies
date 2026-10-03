import Link from 'next/link';
import { Tabs, type TabItem } from '@abies/design-system/components/ui/tabs';
import { VerificationBadge } from '@abies/design-system/components/ui/badge';
import { Card } from '@abies/design-system/components/ui/card';
import { queue as queueDoctors } from '@abies/domain/modules/doctors/admin-doctors.service';
import { queue as queueLabs } from '@abies/domain/modules/diagnostics/admin-labs.service';
import { queue as queuePharmacies } from '@abies/domain/modules/medicines/admin-pharmacies.service';
import { queue as queueCentres } from '@abies/domain/modules/panchakarma/admin-centres.service';
import { queue as queueTherapists } from '@abies/domain/modules/panchakarma/admin-therapists.service';

// ENTERPRISE-13 — consolidates what used to be 5 standalone queue pages
// (/admin/{doctors,labs,pharmacies,panchakarma-centres,therapists}) into
// one tabbed Verification Centre. Detail/review pages stay at their
// original entity-specific routes (/admin/doctors/[id] etc.) — only the
// list view moves here.
const ENTITY_DEFS = [
  { key: 'doctors', label: 'Doctors', basePath: '/ops/admin/doctors' },
  { key: 'labs', label: 'Labs', basePath: '/ops/admin/labs' },
  { key: 'pharmacies', label: 'Pharmacies', basePath: '/ops/admin/pharmacies' },
  { key: 'panchakarma-centres', label: 'Panchakarma Centres', basePath: '/ops/admin/panchakarma-centres' },
  { key: 'therapists', label: 'Therapists', basePath: '/ops/admin/therapists' },
] as const;
type EntityKey = (typeof ENTITY_DEFS)[number]['key'];

const STATUS_DEFS = [
  { label: 'Needs review', status: undefined },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Rejected', status: 'REJECTED' },
  { label: 'Suspended', status: 'SUSPENDED' },
] as const;
const VALID_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;

export default async function VerificationCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; status?: string }>;
}) {
  const { entity, status } = await searchParams;
  const activeEntity: EntityKey = ENTITY_DEFS.find((e) => e.key === entity)?.key ?? 'doctors';
  const validStatus = VALID_STATUSES.find((s) => s === status);

  const entityTabs: TabItem[] = ENTITY_DEFS.map((e) => ({
    label: e.label,
    href: `/ops/admin/verification?entity=${e.key}`,
    active: activeEntity === e.key,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Verification Centre</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Every provider onboarding queue in one place — doctors, diagnostic labs, pharmacies, Panchakarma centres, and
        therapist documents.
      </p>

      <div className="mt-4">
        <Tabs items={entityTabs} />
      </div>

      {activeEntity === 'therapists' ? (
        <TherapistQueue />
      ) : (
        <>
          <div className="mt-4">
            <Tabs
              items={STATUS_DEFS.map((s) => ({
                label: s.label,
                href: s.status ? `/ops/admin/verification?entity=${activeEntity}&status=${s.status}` : `/ops/admin/verification?entity=${activeEntity}`,
                active: validStatus === s.status,
              }))}
            />
          </div>
          {activeEntity === 'doctors' && <DoctorQueue status={validStatus} />}
          {activeEntity === 'labs' && <LabQueue status={validStatus} />}
          {activeEntity === 'pharmacies' && <PharmacyQueue status={validStatus} />}
          {activeEntity === 'panchakarma-centres' && <CentreQueue status={validStatus} />}
        </>
      )}
    </div>
  );
}

function QueueList({
  total,
  emptyLabel,
  children,
}: {
  total: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 space-y-3">
      <p className="text-sm text-brand-neutral-600">{total} application(s)</p>
      {children}
      {total === 0 && <p className="text-sm text-brand-neutral-500">{emptyLabel}</p>}
    </div>
  );
}

async function DoctorQueue({ status }: { status?: (typeof VALID_STATUSES)[number] }) {
  const { doctors, total } = await queueDoctors(status);
  return (
    <QueueList total={total} emptyLabel="Nothing here.">
      {doctors.map((d) => (
        <Link key={d.id} href={`/ops/admin/doctors/${d.id}`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-brand-neutral-900">{d.name || 'Unnamed applicant'}</p>
                <p className="text-sm text-brand-neutral-500">
                  {d.mobile} · {d.qualification ?? 'No qualification set'} · {d.registrationCouncil ?? '—'}
                </p>
              </div>
              <VerificationBadge status={d.verificationStatus} />
            </div>
            <div className="mt-2 text-xs text-brand-neutral-400">
              {d.documentCount} document(s) · {d.clinicCount} clinic(s)
              {d.submittedAt ? ` · submitted ${new Date(d.submittedAt).toLocaleDateString()}` : ''}
            </div>
          </Card>
        </Link>
      ))}
    </QueueList>
  );
}

async function LabQueue({ status }: { status?: (typeof VALID_STATUSES)[number] }) {
  const { labs, total } = await queueLabs(status);
  return (
    <QueueList total={total} emptyLabel="Nothing here.">
      {labs.map((l) => (
        <Link key={l.id} href={`/ops/admin/labs/${l.id}`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-brand-neutral-900">{l.name || 'Unnamed applicant'}</p>
                <p className="text-sm text-brand-neutral-500">
                  {l.mobile} · {l.licenseNumbers.join(', ') || 'No license numbers set'}
                </p>
              </div>
              <VerificationBadge status={l.verificationStatus} />
            </div>
            <div className="mt-2 text-xs text-brand-neutral-400">
              {l.serviceCities.join(', ') || 'No cities set'}
              {l.submittedAt ? ` · submitted ${new Date(l.submittedAt).toLocaleDateString()}` : ''}
            </div>
          </Card>
        </Link>
      ))}
    </QueueList>
  );
}

async function PharmacyQueue({ status }: { status?: (typeof VALID_STATUSES)[number] }) {
  const { pharmacies, total } = await queuePharmacies(status);
  return (
    <QueueList total={total} emptyLabel="Nothing here.">
      {pharmacies.map((p) => (
        <Link key={p.id} href={`/ops/admin/pharmacies/${p.id}`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-brand-neutral-900">{p.name || 'Unnamed applicant'}</p>
                <p className="text-sm text-brand-neutral-500">
                  {p.mobile} · {p.licenseNumbers.join(', ') || 'No license numbers set'}
                </p>
              </div>
              <VerificationBadge status={p.verificationStatus} />
            </div>
            <div className="mt-2 text-xs text-brand-neutral-400">
              {p.serviceAreas.join(', ') || 'No areas set'}
              {p.submittedAt ? ` · submitted ${new Date(p.submittedAt).toLocaleDateString()}` : ''}
            </div>
          </Card>
        </Link>
      ))}
    </QueueList>
  );
}

async function CentreQueue({ status }: { status?: (typeof VALID_STATUSES)[number] }) {
  const { centres, total } = await queueCentres(status);
  return (
    <QueueList total={total} emptyLabel="Nothing here.">
      {centres.map((c) => (
        <Link key={c.id} href={`/ops/admin/panchakarma-centres/${c.id}`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-brand-neutral-900">{c.name || 'Unnamed applicant'}</p>
                <p className="text-sm text-brand-neutral-500">
                  {c.mobile} · {c.licenseNumbers.join(', ') || 'No license numbers set'}
                </p>
              </div>
              <VerificationBadge status={c.verificationStatus} />
            </div>
            <div className="mt-2 text-xs text-brand-neutral-400">
              {c.city || 'No city set'}
              {c.submittedAt ? ` · submitted ${new Date(c.submittedAt).toLocaleDateString()}` : ''}
            </div>
          </Card>
        </Link>
      ))}
    </QueueList>
  );
}

async function TherapistQueue() {
  const { therapists, total } = await queueTherapists();
  return (
    <QueueList total={total} emptyLabel="Nothing needs review right now.">
      <p className="text-xs text-brand-neutral-500">Therapists with at least one document awaiting review.</p>
      {therapists.map((t) => {
        const pending = t.documents.filter((d) => d.status !== 'VERIFIED').length;
        return (
          <Link key={t.id} href={`/ops/admin/therapists/${t.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-brand-neutral-900">{t.name}</p>
                  <p className="text-sm text-brand-neutral-500">{t.centre.name ?? 'Unnamed centre'}</p>
                </div>
                <span className="text-xs text-brand-orange-600">{pending} document(s) need review</span>
              </div>
            </Card>
          </Link>
        );
      })}
    </QueueList>
  );
}
