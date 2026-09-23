import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/patient', label: 'Dashboard' },
  { href: '/patient/profile', label: 'Profile' },
  { href: '/patient/family', label: 'Family' },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['PATIENT']} portalLabel="Patient" nav={NAV}>
      {children}
    </PortalShell>
  );
}
