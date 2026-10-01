import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/doctor', label: 'Overview' },
  { href: '/doctor/appointments', label: 'Appointments' },
  { href: '/doctor/care-plans', label: 'Care Plans' },
  { href: '/doctor/diagnostics', label: 'Diagnostics' },
  { href: '/doctor/panchakarma', label: 'Panchakarma' },
  { href: '/doctor/earnings', label: 'Earnings' },
  { href: '/doctor/profile', label: 'Profile' },
  { href: '/doctor/documents', label: 'Documents' },
  { href: '/doctor/clinics', label: 'Clinics' },
  { href: '/doctor/availability', label: 'Availability' },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['DOCTOR']} portalLabel="Doctor" nav={NAV}>
      {children}
    </PortalShell>
  );
}
