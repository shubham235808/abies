import type { UserRole } from '@prisma/client';
import { ForbiddenError } from '../../lib/errors';

// CRM access rules (docs/CRM-IMPLEMENTATION-PLAN.md D1/D2). Enforced in the
// service layer, so every route and any future caller goes through them.
//
// - SALES (sales agent): sees and works only leads assigned to them or created
//   by them. Can change stage and add activities on those leads.
// - SALES_MANAGER, CRM_ADMIN, ADMIN: see and work every lead; can assign.
// - MARKETING, AUDITOR: read every lead; no writes.
// - Anyone else: no CRM access.

export const CRM_READ_ALL_ROLES: UserRole[] = ['ADMIN', 'CRM_ADMIN', 'SALES_MANAGER', 'MARKETING', 'AUDITOR'];
export const CRM_WRITE_ALL_ROLES: UserRole[] = ['ADMIN', 'CRM_ADMIN', 'SALES_MANAGER'];
export const CRM_AGENT_ROLE: UserRole = 'SALES';
export const CRM_ACCESS_ROLES: UserRole[] = [...CRM_READ_ALL_ROLES, CRM_AGENT_ROLE];
export const CRM_ASSIGN_ROLES: UserRole[] = ['ADMIN', 'CRM_ADMIN', 'SALES_MANAGER'];

export interface CrmActor {
  userId: string;
  role: UserRole;
  mfaVerified?: boolean;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
}

// Who may own a lead. Read-only roles (marketing, auditor) can't work leads, so
// they can't be assigned them.
export const CRM_OWNER_ROLES: UserRole[] = ['ADMIN', 'CRM_ADMIN', 'SALES_MANAGER', 'SALES'];

export function requireCrmAccess(actor: CrmActor): void {
  if (!CRM_ACCESS_ROLES.includes(actor.role)) throw new ForbiddenError('CRM access is not enabled for this role');
  // An admin session that hasn't completed MFA gets no customer data.
  if (actor.role === 'ADMIN' && actor.mfaVerified !== true) {
    throw new ForbiddenError('MFA verification required');
  }
}

export function canReadAllLeads(actor: CrmActor): boolean {
  return CRM_READ_ALL_ROLES.includes(actor.role);
}

export function canWriteLeads(actor: CrmActor): boolean {
  return CRM_WRITE_ALL_ROLES.includes(actor.role) || actor.role === CRM_AGENT_ROLE;
}

export function canAssignLeads(actor: CrmActor): boolean {
  return CRM_ASSIGN_ROLES.includes(actor.role);
}

// The row-level filter for list and detail reads. Agents only see their own
// leads; everyone else with CRM access sees all.
export function leadVisibilityWhere(actor: CrmActor): Record<string, unknown> {
  requireCrmAccess(actor);
  if (canReadAllLeads(actor)) return {};
  return { OR: [{ assignedToId: actor.userId }, { createdById: actor.userId }] };
}
