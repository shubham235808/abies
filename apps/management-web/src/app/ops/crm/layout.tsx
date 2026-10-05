import { PortalShell } from '@abies/design-system/layouts/portal-shell';

const NAV = [{ href: '/ops/crm/leads', label: 'Leads' }];

// CRM access rules: packages/domain/src/modules/crm/rbac.ts. The layout only
// decides who can open the section; the services check scope on every call.
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell
      loginPath="/ops/login"
      allowedRoles={['ADMIN', 'CRM_ADMIN', 'SALES_MANAGER', 'SALES', 'MARKETING', 'AUDITOR']}
      portalLabel="CRM"
      nav={NAV}
    >
      {children}
    </PortalShell>
  );
}
