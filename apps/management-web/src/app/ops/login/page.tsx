import { LoginFlow } from '@abies/design-system/components/auth/login-flow';

// Ops portal sign-in. Accounts are created by an administrator.
export default function OpsLoginPage() {
  return (
    <LoginFlow
      heading="Operations sign-in"
      subheading="Staff and administrators. We'll send a one-time code."
      roles={[
        { value: 'CUSTOMER_SUPPORT', label: 'Customer Support' },
        { value: 'TECH_SUPPORT', label: 'Technical Support' },
        { value: 'SALES', label: 'Sales / Partner Ops' },
        { value: 'CARE_COORDINATOR', label: 'Care Coordinator' },
        { value: 'ADMIN', label: 'Administrator' },
      ]}
    />
  );
}
