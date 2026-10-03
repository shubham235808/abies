import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [{ href: '/ops/tech-support', label: 'Ticket queue' }];

export default function TechSupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['TECH_SUPPORT']} portalLabel="Technical Support" nav={NAV}>
      {children}
    </PortalShell>
  );
}
