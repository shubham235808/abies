import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/sales', label: 'Partner leads' },
  { href: '/sales/tickets', label: 'Tickets' },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['SALES']} portalLabel="Sales / Partner Ops" nav={NAV}>
      {children}
    </PortalShell>
  );
}
