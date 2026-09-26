import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/admin/doctors', label: 'Doctor Verification' },
  { href: '/admin/labs', label: 'Lab Verification' },
  { href: '/admin/pharmacies', label: 'Pharmacy Verification' },
  { href: '/admin/panchakarma-centres', label: 'Panchakarma Verification' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['ADMIN']} portalLabel="Admin" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
