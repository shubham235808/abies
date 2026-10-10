import { Tabs, type TabItem } from '@abies/design-system/components/ui/tabs';
import { queue as approvedLabsQueue } from '@abies/domain/modules/diagnostics/admin-labs.service';
import { adminListPackages, adminListTests } from '@abies/domain/modules/diagnostics/catalogue.service';
import { PackagesManager } from './packages-manager';
import { TestsManager } from './tests-manager';

const TAB_DEFS = [
  { key: 'tests', label: 'Tests' },
  { key: 'packages', label: 'Packages' },
] as const;
type TabKey = (typeof TAB_DEFS)[number]['key'];

export default async function AdminDiagnosticsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const activeTab: TabKey = TAB_DEFS.find((t) => t.key === tab)?.key ?? 'tests';

  const tabItems: TabItem[] = TAB_DEFS.map((t) => ({
    label: t.label,
    href: t.key === 'tests' ? '/ops/admin/diagnostics' : `/ops/admin/diagnostics?tab=${t.key}`,
    active: activeTab === t.key,
  }));

  const labsResult = await approvedLabsQueue('APPROVED');
  const labs = labsResult.labs.map((l) => ({ id: l.id, name: l.name ?? l.mobile }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Diagnostics</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Create and price tests and packages on behalf of any approved lab. Pick the lab first — a test or package
        always belongs to exactly one lab.
      </p>

      <div className="mt-4">
        <Tabs items={tabItems} />
      </div>

      <div className="mt-6">
        {activeTab === 'tests' && <TestsSection labs={labs} />}
        {activeTab === 'packages' && <PackagesSection labs={labs} />}
      </div>
    </div>
  );
}

async function TestsSection({ labs }: { labs: { id: string; name: string | null }[] }) {
  const tests = await adminListTests();
  return (
    <TestsManager
      labs={labs}
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
        lab: { id: t.lab.id, name: t.lab.name },
      }))}
    />
  );
}

async function PackagesSection({ labs }: { labs: { id: string; name: string | null }[] }) {
  const [packages, tests] = await Promise.all([adminListPackages(), adminListTests()]);
  return (
    <PackagesManager
      labs={labs}
      allTests={tests.map((t) => ({ id: t.id, name: t.name, labId: t.lab.id, active: t.active }))}
      initial={packages.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        active: p.active,
        lab: { id: p.lab.id, name: p.lab.name },
        tests: p.tests.map((t) => ({ test: { id: t.test.id, name: t.test.name } })),
      }))}
    />
  );
}
