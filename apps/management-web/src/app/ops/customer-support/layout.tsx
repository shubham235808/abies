import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [{ href: '/ops/customer-support', label: 'Ticket queue' }];

export default function CustomerSupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/ops/login" allowedRoles={['CUSTOMER_SUPPORT']} portalLabel="Customer Support" nav={NAV}>
      {children}
    </PortalShell>
  );
}
