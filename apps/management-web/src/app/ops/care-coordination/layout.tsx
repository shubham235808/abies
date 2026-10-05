import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [{ href: '/ops/care-coordination', label: 'Dashboard' }];

export default function CareCoordinationLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/ops/login" allowedRoles={['CARE_COORDINATOR']} portalLabel="Care Coordination" nav={NAV}>
      {children}
    </PortalShell>
  );
}
