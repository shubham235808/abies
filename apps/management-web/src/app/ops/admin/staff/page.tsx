import { listStaff } from '@abies/domain/modules/staff/staff.service';
import { CreateStaffForm } from './create-staff-form';
import { StaffRow } from './staff-row';

export default async function AdminStaffPage() {
  const staff = await listStaff();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Staff accounts</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Customer Support, Technical Support, Sales and Care Coordinator accounts don&apos;t self-onboard — provision
        them here.
      </p>

      <CreateStaffForm />

      <div className="mt-6 space-y-3">
        {staff.length === 0 && <p className="text-sm text-brand-neutral-500">No staff accounts yet.</p>}
        {staff.map((s) => (
          <StaffRow
            key={s.id}
            userId={s.id}
            mobile={s.mobile}
            role={s.role}
            title={s.staffProfile?.title ?? null}
            active={s.staffProfile?.active ?? true}
          />
        ))}
      </div>
    </div>
  );
}
