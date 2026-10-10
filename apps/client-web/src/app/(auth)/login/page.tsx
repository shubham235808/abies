import { PasswordAuthFlow } from '@abies/design-system/components/auth/password-auth-flow';

// Patients only. Partner and ops staff sign in at their own portal's login
// (/partner/login, /ops/login) so each portal's roles stay separate.
// Password-first (docs/password-auth-backend.md): new patients register
// here directly; OTP only resurfaces for setting up a password on a legacy
// account or for a forgotten-password reset.
export default function LoginPage() {
  return (
    <PasswordAuthFlow
      subheading="Sign in with your mobile number or email."
      allowSelfRegistration
    />
  );
}
