import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { listMineAsDoctor } from '@/modules/hospital/admissions.service';
import { requireSessionOrRedirect } from '@/server/current-user';

const STATUS_TONE = { ADMITTED: 'orange', DISCHARGED: 'success', TRANSFERRED_OUT: 'neutral' } as const;

export default async function DoctorHospitalPage() {
  const session = await requireSessionOrRedirect();
  const admissions = await listMineAsDoctor(session.userId);
  const active = admissions.filter((a) => a.status === 'ADMITTED');
  const past = admissions.filter((a) => a.status !== 'ADMITTED');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Hospital</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Patients you&apos;re attending as the admitting doctor.</p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Currently admitted</h2>
        {active.length === 0 ? (
          <EmptyState message="No patients currently admitted under your care." />
        ) : (
          <div className="mt-3 space-y-3">
            {active.map((a) => (
              <AdmissionCard key={a.id} admission={a} />
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Past admissions</h2>
          <div className="mt-3 space-y-3">
            {past.map((a) => (
              <AdmissionCard key={a.id} admission={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdmissionCard({
  admission: a,
}: {
  admission: {
    id: string;
    status: keyof typeof STATUS_TONE;
    reason: string;
    admittedAt: Date;
    facility: { name: string };
    bed: { label: string; ward: { name: string } };
    patientUser: { mobile: string; patientProfile: { firstName: string | null; lastName: string | null } | null };
  };
}) {
  const patientName = [a.patientUser.patientProfile?.firstName, a.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') || a.patientUser.mobile;
  return (
    <Link href={`/doctor/hospital/${a.id}`}>
      <Card className="transition-colors hover:border-brand-purple-300">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{patientName}</CardTitle>
            <CardDescription>
              {a.facility.name} · {a.bed.ward.name} · Bed {a.bed.label} · Admitted {new Date(a.admittedAt).toLocaleDateString('en-IN')}
            </CardDescription>
          </div>
          <Badge tone={STATUS_TONE[a.status]}>{a.status.replace(/_/g, ' ')}</Badge>
        </div>
        <p className="mt-2 text-sm text-brand-neutral-700">{a.reason}</p>
      </Card>
    </Link>
  );
}
