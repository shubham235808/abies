import { listMyTherapists } from '@/modules/panchakarma/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { TherapistsManager } from './therapists-manager';

export default async function PanchakarmaCentreTherapistsPage() {
  const session = await requireSessionOrRedirect();
  const therapists = await listMyTherapists(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Therapists</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Your practitioner roster, for assigning to scheduled sessions.</p>
      <div className="mt-6">
        <TherapistsManager
          initial={therapists.map((t) => ({ id: t.id, name: t.name, qualifications: t.qualifications, active: t.active }))}
        />
      </div>
    </div>
  );
}
