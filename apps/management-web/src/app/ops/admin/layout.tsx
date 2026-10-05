import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/ops/admin', label: 'Overview' },
  { href: '/ops/admin/verification', label: 'Verification Centre' },
  { href: '/ops/admin/staff', label: 'Staff' },
  { href: '/ops/admin/refunds', label: 'Refunds' },
  { href: '/ops/admin/audit', label: 'Audit Log' },
  { href: '/ops/admin/configuration', label: 'Configuration' },
  { href: '/ops/admin/settlement', label: 'Settlement' },
  { href: '/ops/admin/hospital', label: 'Hospital' },
  { href: '/ops/admin/promotions', label: 'Promotions' },
  { href: '/ops/admin/reports', label: 'Reports' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/ops/login" allowedRoles={['ADMIN']} portalLabel="Admin" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
