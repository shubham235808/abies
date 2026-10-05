import { LoginFlow } from '@abies/design-system/components/auth/login-flow';

// Partner portal sign-in. Access is granted by an ops admin (no self-onboarding).
export default function PartnerLoginPage() {
  return (
    <LoginFlow
      heading="Partner sign-in"
      subheading="Doctors, labs, pharmacies and Panchakarma centres. We'll send a one-time code."
      roles={[
        { value: 'DOCTOR', label: 'Doctor / Vaidya' },
        { value: 'LAB', label: 'Diagnostic Lab' },
        { value: 'PHARMACY', label: 'Pharmacy' },
        { value: 'PANCHAKARMA_CENTRE', label: 'Panchakarma Centre' },
      ]}
    />
  );
}
