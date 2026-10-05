import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/partner/doctor', label: 'Overview' },
  { href: '/partner/doctor/appointments', label: 'Appointments' },
  { href: '/partner/doctor/care-plans', label: 'Care Plans' },
  { href: '/partner/doctor/diagnostics', label: 'Diagnostics' },
  { href: '/partner/doctor/panchakarma', label: 'Panchakarma' },
  { href: '/partner/doctor/hospital', label: 'Hospital' },
  { href: '/partner/doctor/earnings', label: 'Earnings' },
  { href: '/partner/doctor/profile', label: 'Profile' },
  { href: '/partner/doctor/documents', label: 'Documents' },
  { href: '/partner/doctor/clinics', label: 'Clinics' },
  { href: '/partner/doctor/availability', label: 'Availability' },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell loginPath="/partner/login" allowedRoles={['DOCTOR']} portalLabel="Doctor" nav={NAV}>
      {children}
    </PortalShell>
  );
}
