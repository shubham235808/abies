import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/ops/sales', label: 'Partner leads' },
  { href: '/ops/sales/tickets', label: 'Tickets' },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['SALES']} portalLabel="Sales / Partner Ops" nav={NAV}>
      {children}
    </PortalShell>
  );
}
