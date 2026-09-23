import { listFamilyMembers } from '@/modules/patients/patients.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { FamilyManager } from './family-manager';

export default async function PatientFamilyPage() {
  const session = await requireSessionOrRedirect();
  const members = await listFamilyMembers(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Family members</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Add a parent, spouse, child or dependent so bookings and records clearly identify who care is
        actually for.
      </p>
      <div className="mt-6">
        <FamilyManager
          initial={members.map((m) => ({
            id: m.id,
            name: m.name,
            relation: m.relation,
            dateOfBirth: m.dateOfBirth ? m.dateOfBirth.toISOString().slice(0, 10) : null,
            gender: m.gender,
            mobile: m.mobile,
          }))}
        />
      </div>
    </div>
  );
}
