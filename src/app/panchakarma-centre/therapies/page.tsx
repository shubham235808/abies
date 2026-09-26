import { listMyTherapies } from '@/modules/panchakarma/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { TherapiesManager } from './therapies-manager';

export default async function PanchakarmaCentreTherapiesPage() {
  const session = await requireSessionOrRedirect();
  const therapies = await listMyTherapies(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Therapies</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Therapies you offer. Only active therapies at an approved centre appear on the public Panchakarma catalogue.
      </p>
      <div className="mt-6">
        <TherapiesManager
          initial={therapies.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            durationMinutes: t.durationMinutes,
            prerequisites: t.prerequisites,
            contraindications: t.contraindications,
            price: t.price,
            requiredSupervision: t.requiredSupervision,
            active: t.active,
          }))}
        />
      </div>
    </div>
  );
}
