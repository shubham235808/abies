import type { StaffDepartment } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { normalizeMobile } from '@/modules/auth/auth.service';
import { recordAuditEvent, type AuditContext } from '@/server/audit';
import type { createStaffAccountSchema } from './staff.schemas';

type CreateStaffAccountInput = z.infer<typeof createStaffAccountSchema>;

// None of these four roles self-onboard (auth.service.ts's requestOtp/
// verifyOtp gate) — an admin provisions the account directly, same as the
// demo admin/patient rows in prisma/seed.ts, just through a real UI instead
// of a script. department is derived from role, not chosen separately,
// since each role maps to exactly one support queue.
const DEPARTMENT_FOR_ROLE: Record<CreateStaffAccountInput['role'], StaffDepartment> = {
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
  TECH_SUPPORT: 'TECH_SUPPORT',
  SALES: 'SALES',
  CARE_COORDINATOR: 'CARE_COORDINATION',
};

export async function createStaffAccount(dto: CreateStaffAccountInput, auditCtx: AuditContext) {
  const mobile = normalizeMobile(dto.mobile);
  const existing = await prisma.user.findUnique({ where: { mobile } });
  if (existing) throw new ConflictError('A user with this mobile number already exists');

  const user = await prisma.user.create({
    data: {
      mobile,
      role: dto.role,
      staffProfile: { create: { department: DEPARTMENT_FOR_ROLE[dto.role], title: dto.title } },
    },
    include: { staffProfile: true },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'STAFF_ACCOUNT',
    action: 'CREATED',
    resourceType: 'User',
    resourceId: user.id,
    metadata: { role: dto.role, department: DEPARTMENT_FOR_ROLE[dto.role] },
  });

  return user;
}

export async function listStaff() {
  return prisma.user.findMany({
    where: { role: { in: ['CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR'] } },
    include: { staffProfile: true },
    orderBy: { createdAt: 'desc' },
  });
}

async function setActive(userId: string, active: boolean, auditCtx: AuditContext) {
  const staffProfile = await prisma.staffProfile.findUnique({ where: { userId } });
  if (!staffProfile) throw new NotFoundError('Staff profile not found');
  const updated = await prisma.staffProfile.update({ where: { userId }, data: { active } });
  await recordAuditEvent(auditCtx, {
    eventType: 'STAFF_ACCOUNT',
    action: active ? 'REACTIVATED' : 'DEACTIVATED',
    resourceType: 'User',
    resourceId: userId,
  });
  return updated;
}

export const deactivateStaff = (userId: string, auditCtx: AuditContext) => setActive(userId, false, auditCtx);
export const reactivateStaff = (userId: string, auditCtx: AuditContext) => setActive(userId, true, auditCtx);
