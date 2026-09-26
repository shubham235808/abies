import { PortalShell } from '@/components/layouts/portal-shell';

const NAV = [
  { href: '/care-coordination', label: 'Ticket queue' },
  { href: '/care-coordination/care-plans', label: 'Care plan follow-ups' },
];

export default function CareCoordinationLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell allowedRoles={['CARE_COORDINATOR']} portalLabel="Care Coordination" nav={NAV}>
      {children}
    </PortalShell>
  );
}
