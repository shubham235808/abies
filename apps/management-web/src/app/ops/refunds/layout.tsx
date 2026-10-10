import { PortalShell, type PortalNavItem } from '@abies/design-system/layouts/portal-shell';

// Split out from /ops/admin alongside /ops/settlement (same reasoning —
// see that layout's doc comment): FINANCE needs refunds too, and these
// pages have no gate of their own beyond this layout.
const NAV: PortalNavItem[] = [
  { href: '/ops/settlement', label: 'Settlement' },
  { href: '/ops/refunds', label: 'Refunds' },
];

export default function RefundsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/ops/login" allowedRoles={['ADMIN', 'SUPER_ADMIN', 'FINANCE']} portalLabel="Refunds" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
