import { Tabs, type TabItem } from '@/components/ui/tabs';
import { listMyPackages, listMyTests } from '@/modules/diagnostics/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { PackagesManager } from './packages-manager';
import { TestsManager } from './tests-manager';

const TAB_DEFS = [
  { key: 'tests', label: 'Tests' },
  { key: 'packages', label: 'Packages' },
] as const;
type TabKey = (typeof TAB_DEFS)[number]['key'];

export default async function LabTestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSessionOrRedirect();
  const { tab } = await searchParams;
  const activeTab: TabKey = TAB_DEFS.find((t) => t.key === tab)?.key ?? 'tests';

  const tabItems: TabItem[] = TAB_DEFS.map((t) => ({
    label: t.label,
    href: t.key === 'tests' ? '/lab/tests' : `/lab/tests?tab=${t.key}`,
    active: activeTab === t.key,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Test catalogue</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Tests and bundled packages you offer. Only active items at an approved lab appear on the public diagnostics
        catalogue.
      </p>

      <div className="mt-4">
        <Tabs items={tabItems} />
      </div>

      <div className="mt-6">
        {activeTab === 'tests' && (
          <TestsManagerSection userId={session.userId} />
        )}
        {activeTab === 'packages' && <PackagesManagerSection userId={session.userId} />}
      </div>
    </div>
  );
}

async function TestsManagerSection({ userId }: { userId: string }) {
  const tests = await listMyTests(userId);
  return (
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
  );
}

async function PackagesManagerSection({ userId }: { userId: string }) {
  const [packages, tests] = await Promise.all([listMyPackages(userId), listMyTests(userId)]);
  return (
    <PackagesManager
      initial={packages.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        active: p.active,
        tests: p.tests.map((t) => ({ test: { id: t.test.id, name: t.test.name } })),
      }))}
      availableTests={tests.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
