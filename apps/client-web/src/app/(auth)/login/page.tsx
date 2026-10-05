import { LoginFlow } from '@abies/design-system/components/auth/login-flow';

// Patients only. Partner and ops staff sign in at their own portal's login
// (/partner/login, /ops/login) so each portal's roles stay separate.
export default function LoginPage() {
  return <LoginFlow roles={[{ value: 'PATIENT', label: 'Patient' }]} />;
}
