import type { UserRole } from '@prisma/client';

// docs/ENTERPRISE-DATA-MODEL-CHANGES.md §9 — additive to requireRole, not a
// replacement. Today this is a static, role-keyed vocabulary (one role ==
// one permission set); a DB-backed, admin-editable set is the named later
// refinement once the string vocabulary has stabilized through real use,
// not something to build speculatively ahead of that. Only permissions
// actually checked by requirePermission() call sites need to be listed
// here — this is not meant to be an exhaustive capability catalogue.
export type Permission =
  | 'pharmacy.product.create'
  | 'pharmacy.product.update'
  | 'diagnostics.catalogue.manage'
  | 'panchakarma.catalogue.manage'
  | 'promotion.manage'
  | 'configuration.manage'
  | 'settlement.manage'
  | 'hospital.manage';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  PATIENT: [],
  DOCTOR: [],
  LAB: ['diagnostics.catalogue.manage'],
  PHARMACY: ['pharmacy.product.create', 'pharmacy.product.update'],
  PANCHAKARMA_CENTRE: ['panchakarma.catalogue.manage'],
  CUSTOMER_SUPPORT: [],
  TECH_SUPPORT: [],
  SALES: [],
  CARE_COORDINATOR: [],
  ADMIN: ['promotion.manage', 'configuration.manage', 'settlement.manage', 'hospital.manage'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
