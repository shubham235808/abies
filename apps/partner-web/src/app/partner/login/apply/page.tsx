import Link from 'next/link';
import { LoginFlow } from '@abies/design-system/components/auth/login-flow';

// Partner self-onboarding: the only path left that uses the OTP
// create-account-on-verify flow (requestOtp/verifyOtp), since
// register() always creates a PATIENT. Where ALLOW_*_SELF_ONBOARDING is on
// for a role, verifying the code here creates the account directly; where
// it's off, the server rejects with "must be provisioned by an
// administrator" same as before this page existed.
export default function PartnerApplyPage() {
  return (
    <div>
      <LoginFlow
        heading="Apply as a partner"
        subheading="New here? We'll send a one-time code to get started."
        roles={[
          { value: 'DOCTOR', label: 'Doctor / Vaidya' },
          { value: 'LAB', label: 'Diagnostic Lab' },
          { value: 'PHARMACY', label: 'Pharmacy' },
          { value: 'PANCHAKARMA_CENTRE', label: 'Panchakarma Centre' },
        ]}
      />
      <p className="-mt-6 pb-10 text-center text-sm text-brand-neutral-500">
        Already approved?{' '}
        <Link href="/partner/login" className="font-semibold text-brand-purple-600 underline">
          Sign in with your password
        </Link>
      </p>
    </div>
  );
}
