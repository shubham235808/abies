import { MfaForm } from '@abies/design-system/components/auth/mfa-form';

// Admin MFA step for the ops portal. Reached when an administrator's session
// hasn't completed MFA yet (see PortalShell's requireMfa).
export default function OpsLoginMfaPage() {
  return <MfaForm redirectTo="/ops/admin" />;
}
