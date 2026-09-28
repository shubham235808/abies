import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/doctors', label: 'Doctor Verification' },
  { href: '/admin/labs', label: 'Lab Verification' },
  { href: '/admin/pharmacies', label: 'Pharmacy Verification' },
  { href: '/admin/panchakarma-centres', label: 'Panchakarma Verification' },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/refunds', label: 'Refunds' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/admin/configuration', label: 'Configuration' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['ADMIN']} portalLabel="Admin" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
