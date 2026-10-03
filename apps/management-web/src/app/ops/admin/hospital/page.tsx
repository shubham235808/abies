import { Tabs, type TabItem } from '@abies/design-system/components/ui/tabs';
import { admissionBoard, listApprovedDoctorOptions, listFacilities } from '@abies/domain/modules/hospital/facilities.service';
import { AdmissionBoard, type BoardFacility } from './admission-board';
import { FacilitiesManager } from './facilities-manager';

function toBoardFacilities(facilities: Awaited<ReturnType<typeof admissionBoard>>): BoardFacility[] {
  return facilities.map((f) => ({
    id: f.id,
    name: f.name,
    wards: f.wards.map((w) => ({
      id: w.id,
      name: w.name,
      beds: w.beds.map((b) => {
        const admission = b.admissions[0];
        return {
          id: b.id,
          label: b.label,
          status: b.status,
          admission: admission
            ? {
                id: admission.id,
                reason: admission.reason,
                admittedAt: admission.admittedAt.toISOString(),
                patientName:
                  [admission.patientUser.patientProfile?.firstName, admission.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
                  admission.patientUser.mobile,
                doctorName: [admission.admittingDoctor.firstName, admission.admittingDoctor.lastName].filter(Boolean).join(' '),
              }
            : null,
        };
      }),
    })),
  }));
}

const TAB_DEFS = [
  { key: 'board', label: 'Admission board' },
  { key: 'facilities', label: 'Facilities' },
] as const;
type TabKey = (typeof TAB_DEFS)[number]['key'];

// EXPANSION-4 — the "Hospital Operations" screen (master prompt §8.5):
// bed occupancy by ward, admit/transfer/discharge actions, and
// facility/ward/bed setup.
export default async function AdminHospitalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const activeTab: TabKey = TAB_DEFS.find((t) => t.key === tab)?.key ?? 'board';

  const tabItems: TabItem[] = TAB_DEFS.map((t) => ({
    label: t.label,
    href: t.key === 'board' ? '/ops/admin/hospital' : `/ops/admin/hospital?tab=${t.key}`,
    active: activeTab === t.key,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Hospital</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Bed occupancy, admissions, transfers and discharges, plus facility/ward/bed setup.
      </p>

      <div className="mt-4">
        <Tabs items={tabItems} />
      </div>

      <div className="mt-6">
        {activeTab === 'board' && <AdmissionBoard initial={toBoardFacilities(await admissionBoard())} doctorOptions={await listApprovedDoctorOptions()} />}
        {activeTab === 'facilities' && <FacilitiesManager initial={await listFacilities()} />}
      </div>
    </div>
  );
}
