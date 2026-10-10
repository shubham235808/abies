import { PasswordAuthFlow } from '@abies/design-system/components/auth/password-auth-flow';

// Ops portal sign-in. Accounts are always created by an administrator —
// there is no self-onboarding path here, so unlike partner-web this never
// links out to an OTP sign-up page.
export default function OpsLoginPage() {
  return <PasswordAuthFlow heading="Operations sign-in" subheading="Staff and administrators." />;
}
