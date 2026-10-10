import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/ops/admin', label: 'Overview' },
  { href: '/ops/admin/verification', label: 'Verification Centre' },
  { href: '/ops/admin/staff', label: 'Staff' },
  { href: '/ops/admin/products', label: 'Products' },
  { href: '/ops/admin/diagnostics', label: 'Diagnostics' },
  { href: '/ops/crm/leads', label: 'CRM' },
  { href: '/ops/refunds', label: 'Refunds' },
  { href: '/ops/admin/audit', label: 'Audit Log' },
  { href: '/ops/admin/configuration', label: 'Configuration' },
  { href: '/ops/settlement', label: 'Settlement' },
  { href: '/ops/admin/hospital', label: 'Hospital' },
  { href: '/ops/admin/promotions', label: 'Promotions' },
  { href: '/ops/admin/content', label: 'Content' },
  { href: '/ops/admin/reports', label: 'Reports' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/ops/login" allowedRoles={['ADMIN', 'SUPER_ADMIN']} portalLabel="Admin" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
