import { Badge } from '@abies/design-system/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@abies/design-system/components/ui/card';
import { EmptyState } from '@abies/design-system/components/ui/empty-state';
import { listMineAsPatient } from '@abies/domain/modules/hospital/admissions.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

const STATUS_TONE = { ADMITTED: 'orange', DISCHARGED: 'success', TRANSFERRED_OUT: 'neutral' } as const;

export default async function PatientHospitalPage() {
  const session = await requireSessionOrRedirect();
  const admissions = await listMineAsPatient(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Hospital admissions</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        A read-only record of your inpatient care — current and past admissions, with your discharge summary once
        one has been written.
      </p>

      {admissions.length === 0 ? (
        <EmptyState message="No hospital admissions on record." />
      ) : (
        <div className="mt-6 space-y-4">
          {admissions.map((a) => {
            const doctorName = [a.admittingDoctor.firstName, a.admittingDoctor.lastName].filter(Boolean).join(' ') || 'Attending doctor';
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{a.facility.name}</CardTitle>
                    <CardDescription>
                      {a.bed.ward.name} · Bed {a.bed.label} · Admitted {new Date(a.admittedAt).toLocaleDateString('en-IN')}
                      {a.dischargedAt ? ` · Discharged ${new Date(a.dischargedAt).toLocaleDateString('en-IN')}` : ''}
                    </CardDescription>
                  </div>
                  <Badge tone={STATUS_TONE[a.status]}>{a.status.replace(/_/g, ' ')}</Badge>
                </div>
                <p className="mt-3 text-sm text-brand-neutral-700">{a.reason}</p>
                <p className="mt-1 text-xs text-brand-neutral-400">Attending: {doctorName}</p>

                {a.dischargeSummary && (
                  <div className="mt-4 rounded-card border border-brand-neutral-100 bg-brand-neutral-50 p-4">
                    <p className="text-sm font-semibold text-brand-neutral-900">Discharge summary</p>
                    <p className="mt-1 text-sm text-brand-neutral-700">{a.dischargeSummary.summary}</p>
                    {a.dischargeSummary.followUpInstructions && (
                      <p className="mt-2 text-sm text-brand-neutral-600">
                        <span className="font-medium">Follow-up: </span>
                        {a.dischargeSummary.followUpInstructions}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
