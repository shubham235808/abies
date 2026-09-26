import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/panchakarma-centre', label: 'Overview' },
  { href: '/panchakarma-centre/profile', label: 'Profile' },
  { href: '/panchakarma-centre/therapies', label: 'Therapies' },
  { href: '/panchakarma-centre/therapists', label: 'Therapists' },
  { href: '/panchakarma-centre/bookings', label: 'Bookings' },
];

export default function PanchakarmaCentreLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['PANCHAKARMA_CENTRE']} portalLabel="Panchakarma Centre" nav={NAV}>
      {children}
    </PortalShell>
  );
}
