import { PortalShell, type PortalNavItem } from '@abies/design-system/layouts/portal-shell';
import { getCurrentSession } from '@abies/domain/server/current-user';

// The CRM menu from docs/CRM-IMPLEMENTATION-PLAN.md. Items marked soon are
// planned for later phases and aren't linked yet.
const CRM_NAV: PortalNavItem[] = [
  { href: '/ops/crm/dashboard', label: 'Dashboard' },
  { href: '/ops/crm/leads', label: 'Leads' },
  { href: '/ops/crm/customers', label: 'Customers', soon: true },
  { href: '/ops/crm/opportunities', label: 'Opportunities' },
  { href: '/ops/crm/pipeline', label: 'Pipeline' },
  { href: '/ops/crm/tasks', label: 'Tasks' },
  { href: '/ops/crm/follow-ups', label: 'Follow-ups', soon: true },
  { href: '/ops/crm/communications', label: 'Communications', soon: true },
  { href: '/ops/crm/campaigns', label: 'Campaigns', soon: true },
  { href: '/ops/crm/segments', label: 'Segments', soon: true },
  { href: '/ops/crm/reports', label: 'Reports', soon: true },
  { href: '/ops/crm/automation', label: 'Automation', soon: true },
  { href: '/ops/crm/settings', label: 'Settings', soon: true },
];

// Administrators also get the rest of the ops admin sections here.
const ADMIN_NAV: PortalNavItem[] = [
  { href: '/ops/admin', label: 'Admin overview' },
  { href: '/ops/admin/verification', label: 'Verification Centre' },
  { href: '/ops/admin/staff', label: 'Staff' },
  { href: '/ops/admin/products', label: 'Products' },
  { href: '/ops/admin/refunds', label: 'Refunds' },
  { href: '/ops/admin/audit', label: 'Audit Log' },
  { href: '/ops/admin/configuration', label: 'Configuration' },
  { href: '/ops/admin/settlement', label: 'Settlement' },
  { href: '/ops/admin/hospital', label: 'Hospital' },
  { href: '/ops/admin/promotions', label: 'Promotions' },
  { href: '/ops/admin/reports', label: 'Reports' },
];

// CRM access rules: packages/domain/src/modules/crm/rbac.ts. The layout only
// decides who can open the section; the services check scope on every call.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  const nav = session?.user.role === 'ADMIN' ? [...CRM_NAV, ...ADMIN_NAV] : CRM_NAV;
  return (
    <PortalShell
      loginPath="/ops/login"
      requireMfa={session?.user.role === 'ADMIN'}
      allowedRoles={['ADMIN', 'CRM_ADMIN', 'SALES_MANAGER', 'SALES', 'MARKETING', 'AUDITOR']}
      portalLabel="CRM"
      nav={nav}
    >
      {children}
    </PortalShell>
  );
}
