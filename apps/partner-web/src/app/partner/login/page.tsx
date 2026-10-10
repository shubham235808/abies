import { PasswordAuthFlow } from '@abies/design-system/components/auth/password-auth-flow';

// Partner portal sign-in. Password-first for already-approved partners;
// a brand new doctor/lab/pharmacy/panchakarma-centre applicant still signs
// up via the OTP flow at /partner/login/apply, since register() only ever
// creates a PATIENT account and partner roles are approved, not self-served.
export default function PartnerLoginPage() {
  return (
    <PasswordAuthFlow
      heading="Partner sign-in"
      subheading="Doctors, labs, pharmacies and Panchakarma centres."
      otpSignupHref="/partner/login/apply"
    />
  );
}
