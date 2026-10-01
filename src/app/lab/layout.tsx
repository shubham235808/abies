import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/lab', label: 'Overview' },
  { href: '/lab/profile', label: 'Profile' },
  { href: '/lab/tests', label: 'Test catalogue' },
  { href: '/lab/orders', label: 'Orders' },
  { href: '/lab/earnings', label: 'Earnings' },
];

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['LAB']} portalLabel="Diagnostic Lab" nav={NAV}>
      {children}
    </PortalShell>
  );
}
