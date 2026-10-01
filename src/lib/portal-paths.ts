// Single source of truth for "which portal does this role land on" —
// shared by the login flow's post-verify redirect and the public site
// header's "go to your dashboard" link, so the mapping can't drift
// between the two call sites.
export const PORTAL_PATH: Record<string, string> = {
  PATIENT: '/patient',
  DOCTOR: '/doctor',
  LAB: '/lab',
  PHARMACY: '/pharmacy',
  PANCHAKARMA_CENTRE: '/panchakarma-centre',
  CUSTOMER_SUPPORT: '/customer-support',
  TECH_SUPPORT: '/tech-support',
  SALES: '/sales',
  CARE_COORDINATOR: '/care-coordination',
  ADMIN: '/admin',
};
