import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [{ href: '/admin/doctors', label: 'Doctor Verification' }];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['ADMIN']} portalLabel="Admin" nav={NAV} requireMfa>
      {children}
    </PortalShell>
  );
}
