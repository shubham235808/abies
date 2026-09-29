import { Tabs, type TabItem } from '@/components/ui/tabs';
import {
  listConfigCategories,
  listCourierProviders,
  listDocumentRequirements,
  listGstRates,
  listNotificationTemplates,
  listServiceLocations,
} from '@/modules/configuration/configuration.service';
import { CategoriesManager } from './categories-manager';
import { CourierProvidersManager } from './courier-providers-manager';
import { DocumentRequirementsManager } from './document-requirements-manager';
import { GstRatesManager } from './gst-rates-manager';
import { LocationsManager } from './locations-manager';
import { NotificationTemplatesManager } from './notification-templates-manager';

const TAB_DEFS = [
  { key: 'categories', label: 'Categories' },
  { key: 'locations', label: 'Locations' },
  { key: 'document-requirements', label: 'Document requirements' },
  { key: 'courier-providers', label: 'Courier providers' },
  { key: 'notification-templates', label: 'Notification templates' },
  { key: 'gst-rates', label: 'GST rates' },
] as const;
type TabKey = (typeof TAB_DEFS)[number]['key'];

// ENTERPRISE-2 — the admin surface over the five configuration tables
// docs/ENTERPRISE-DATA-MODEL-CHANGES.md §1 added, generalizing
// AssessmentTemplateField's existing "admin-editable, no migration to add
// an entry" shape. Existing enum/free-text fields elsewhere in the app are
// left untouched by this stage — this only makes each canonical list exist
// and be editable; wiring individual consumers to validate against it is a
// later, per-consumer follow-up (docs/ENTERPRISE-IMPLEMENTATION-PLAN.md).
export default async function AdminConfigurationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const activeTab: TabKey = TAB_DEFS.find((t) => t.key === tab)?.key ?? 'categories';

  const tabItems: TabItem[] = TAB_DEFS.map((t) => ({
    label: t.label,
    href: t.key === 'categories' ? '/admin/configuration' : `/admin/configuration?tab=${t.key}`,
    active: activeTab === t.key,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Configuration</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Database-driven lists every portal can offer without a code deploy — specialties, categories, serviceable
        locations, partner document requirements, courier providers, notification templates, and GST rates.
      </p>

      <div className="mt-4">
        <Tabs items={tabItems} />
      </div>

      <div className="mt-6">
        {activeTab === 'categories' && <CategoriesManager initial={await listConfigCategories()} />}
        {activeTab === 'locations' && <LocationsManager initial={await listServiceLocations()} />}
        {activeTab === 'document-requirements' && (
          <DocumentRequirementsManager initial={await listDocumentRequirements()} />
        )}
        {activeTab === 'courier-providers' && <CourierProvidersManager initial={await listCourierProviders()} />}
        {activeTab === 'notification-templates' && (
          <NotificationTemplatesManager initial={await listNotificationTemplates()} />
        )}
        {activeTab === 'gst-rates' && <GstRatesManager initial={await listGstRates()} />}
      </div>
    </div>
  );
}
