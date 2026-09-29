import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/verification', label: 'Verification Centre' },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/refunds', label: 'Refunds' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/admin/configuration', label: 'Configuration' },
  { href: '/admin/promotions', label: 'Promotions' },
  { href: '/admin/reports', label: 'Reports' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['ADMIN']} portalLabel="Admin" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
