import { Tabs, type TabItem } from '@abies/design-system/components/ui/tabs';
import { listFaqEntries } from '@abies/domain/modules/content/faq.service';
import { listNavMenuItems } from '@abies/domain/modules/content/nav.service';
import { listContentPages } from '@abies/domain/modules/content/pages.service';
import { listPageSeo } from '@abies/domain/modules/content/seo.service';
import { listTestimonials } from '@abies/domain/modules/content/testimonials.service';
import { FaqManager } from './faq-manager';
import { NavManager } from './nav-manager';
import { PagesManager } from './pages-manager';
import { SeoManager } from './seo-manager';
import { TestimonialsManager } from './testimonials-manager';

const TAB_DEFS = [
  { key: 'pages', label: 'Pages' },
  { key: 'nav', label: 'Navigation' },
  { key: 'seo', label: 'SEO' },
  { key: 'faq', label: 'FAQ' },
  { key: 'testimonials', label: 'Testimonials' },
] as const;
type TabKey = (typeof TAB_DEFS)[number]['key'];

// Same Tabs-over-one-route shape as /ops/admin/configuration.
export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const activeTab: TabKey = TAB_DEFS.find((t) => t.key === tab)?.key ?? 'pages';

  const tabItems: TabItem[] = TAB_DEFS.map((t) => ({
    label: t.label,
    href: t.key === 'pages' ? '/ops/admin/content' : `/ops/admin/content?tab=${t.key}`,
    active: activeTab === t.key,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Website Content</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Static pages, the public header and footer menus, per-page SEO metadata, the FAQ list, and homepage testimonials.
      </p>

      <div className="mt-4">
        <Tabs items={tabItems} />
      </div>

      <div className="mt-6">
        {activeTab === 'pages' && <PagesManager initial={await listContentPages()} />}
        {activeTab === 'nav' && <NavTab />}
        {activeTab === 'seo' && <SeoTab />}
        {activeTab === 'faq' && <FaqManager initial={await listFaqEntries()} />}
        {activeTab === 'testimonials' && <TestimonialsManager initial={await listTestimonials()} />}
      </div>
    </div>
  );
}

async function NavTab() {
  const [items, pages] = await Promise.all([listNavMenuItems(), listContentPages()]);
  return <NavManager initial={items} pages={pages.map(({ id, slug, title, active }) => ({ id, slug, title, active }))} />;
}

async function SeoTab() {
  const [rows, pages] = await Promise.all([listPageSeo(), listContentPages()]);
  return <SeoManager initial={rows} contentPages={pages.map(({ slug, title, body }) => ({ slug, title, body }))} />;
}
