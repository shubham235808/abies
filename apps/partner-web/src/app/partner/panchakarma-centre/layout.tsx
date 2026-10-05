import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/partner/panchakarma-centre', label: 'Overview' },
  { href: '/partner/panchakarma-centre/profile', label: 'Profile' },
  { href: '/partner/panchakarma-centre/therapies', label: 'Therapies' },
  { href: '/partner/panchakarma-centre/therapists', label: 'Therapists' },
  { href: '/partner/panchakarma-centre/bookings', label: 'Bookings' },
  { href: '/partner/panchakarma-centre/earnings', label: 'Earnings' },
];

export default function PanchakarmaCentreLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/partner/login" allowedRoles={['PANCHAKARMA_CENTRE']} portalLabel="Panchakarma Centre" nav={NAV}>
      {children}
    </PortalShell>
  );
}
