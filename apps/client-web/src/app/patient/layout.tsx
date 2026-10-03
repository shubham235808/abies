import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [
  { href: '/patient', label: 'Dashboard' },
  { href: '/patient/appointments', label: 'Appointments' },
  { href: '/patient/care-plans', label: 'Care Plans' },
  { href: '/patient/diagnostics', label: 'Diagnostics' },
  { href: '/patient/medicines', label: 'Medicines' },
  { href: '/patient/medicines/cart', label: 'Cart' },
  { href: '/patient/panchakarma', label: 'Panchakarma' },
  { href: '/patient/hospital', label: 'Hospital' },
  { href: '/patient/payments', label: 'Payments' },
  { href: '/patient/support', label: 'Support' },
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
