// Single source of truth for "which portal does this role land on" —
// shared by the login flow's post-verify redirect and the public site
// header's "go to your dashboard" link, so the mapping can't drift
// between the two call sites.
// EXPANSION-5 — paths now cross a deployable boundary for every role but
// PATIENT: partner-web owns /partner/*, management-web owns /ops/* (see
// docs/EXPANSION-TARGET-ARCHITECTURE.md's routing section). These stay
// plain path strings, not next/link hrefs — the post-login redirect is a
// real browser navigation (window.location.assign), so Nginx's path-
// prefix routing picks the right app the same way it would for a
// freshly-typed URL.
export const PORTAL_PATH: Record<string, string> = {
  PATIENT: '/patient',
  DOCTOR: '/partner/doctor',
  LAB: '/partner/lab',
  PHARMACY: '/partner/pharmacy',
  PANCHAKARMA_CENTRE: '/partner/panchakarma-centre',
  CUSTOMER_SUPPORT: '/ops/customer-support',
  TECH_SUPPORT: '/ops/tech-support',
  SALES: '/ops/sales',
  CARE_COORDINATOR: '/ops/care-coordination',
  ADMIN: '/ops/admin',
  // SUPER_ADMIN is ADMIN-equivalent (RBAC gap closure); FINANCE lands on
  // its own settlement/refunds section — see that layout's doc comment for
  // why those two pages were split out of /ops/admin.
  SUPER_ADMIN: '/ops/admin',
  FINANCE: '/ops/settlement',
};
