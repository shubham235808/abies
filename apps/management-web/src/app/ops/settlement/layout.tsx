import { PortalShell, type PortalNavItem } from '@abies/design-system/layouts/portal-shell';

// Split out from /ops/admin (RBAC gap closure, docs/admin-portal-status-report.md)
// so FINANCE can reach settlement without also reaching every other admin
// section: these pages read their data via direct server-side service
// calls with no gate of their own, so this layout's allowedRoles is the
// only thing standing between FINANCE and a page outside its grant.
const NAV: PortalNavItem[] = [
  { href: '/ops/settlement', label: 'Settlement' },
  { href: '/ops/refunds', label: 'Refunds' },
];

export default function SettlementLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/ops/login" allowedRoles={['ADMIN', 'SUPER_ADMIN', 'FINANCE']} portalLabel="Settlement" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
