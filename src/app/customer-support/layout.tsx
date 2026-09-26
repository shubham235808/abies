import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [{ href: '/customer-support', label: 'Ticket queue' }];

export default function CustomerSupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['CUSTOMER_SUPPORT']} portalLabel="Customer Support" nav={NAV}>
      {children}
    </PortalShell>
  );
}
