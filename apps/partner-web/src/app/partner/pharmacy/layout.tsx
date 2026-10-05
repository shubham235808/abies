import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/partner/pharmacy', label: 'Overview' },
  { href: '/partner/pharmacy/profile', label: 'Profile' },
  { href: '/partner/pharmacy/inventory', label: 'Inventory' },
  { href: '/partner/pharmacy/orders', label: 'Orders' },
  { href: '/partner/pharmacy/pos', label: 'POS' },
  { href: '/partner/pharmacy/tax-settings', label: 'Tax Settings' },
  { href: '/partner/pharmacy/earnings', label: 'Earnings' },
];

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/partner/login" allowedRoles={['PHARMACY', 'ADMIN']} portalLabel="Pharmacy" nav={NAV}>
      {children}
    </PortalShell>
  );
}
