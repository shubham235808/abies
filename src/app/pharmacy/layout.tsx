import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/pharmacy', label: 'Overview' },
  { href: '/pharmacy/profile', label: 'Profile' },
  { href: '/pharmacy/inventory', label: 'Inventory' },
  { href: '/pharmacy/orders', label: 'Orders' },
  { href: '/pharmacy/pos', label: 'POS' },
  { href: '/pharmacy/tax-settings', label: 'Tax Settings' },
  { href: '/pharmacy/earnings', label: 'Earnings' },
];

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['PHARMACY']} portalLabel="Pharmacy" nav={NAV}>
      {children}
    </PortalShell>
  );
}
