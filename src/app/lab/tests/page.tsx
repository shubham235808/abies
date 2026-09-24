import { listMyTests } from '@/modules/diagnostics/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { TestsManager } from './tests-manager';

export default async function LabTestsPage() {
  const session = await requireSessionOrRedirect();
  const tests = await listMyTests(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Test catalogue</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Tests you offer. Only active tests at an approved lab appear on the public diagnostics catalogue.
      </p>
      <div className="mt-6">
        <TestsManager
          initial={tests.map((t) => ({
            id: t.id,
            code: t.code,
            name: t.name,
            description: t.description,
            sampleType: t.sampleType,
            preparationInstructions: t.preparationInstructions,
            price: t.price,
            turnaroundHours: t.turnaroundHours,
            active: t.active,
          }))}
        />
      </div>
    </div>
  );
}
