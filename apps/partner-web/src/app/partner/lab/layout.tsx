import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/partner/lab', label: 'Overview' },
  { href: '/partner/lab/profile', label: 'Profile' },
  { href: '/partner/lab/tests', label: 'Test catalogue' },
  { href: '/partner/lab/orders', label: 'Orders' },
  { href: '/partner/lab/earnings', label: 'Earnings' },
];

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/partner/login" allowedRoles={['LAB', 'ADMIN']} portalLabel="Diagnostic Lab" nav={NAV}>
      {children}
    </PortalShell>
  );
}
