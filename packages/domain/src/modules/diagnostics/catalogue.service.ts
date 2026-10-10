import { DiagnosticLabVerificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
import { ensureLabProfile } from './labs.service';
import type {
  adminCreatePackageSchema,
  adminCreateTestSchema,
  createPackageSchema,
  createTestSchema,
  publicTestSearchSchema,
  updatePackageSchema,
  updateTestSchema,
} from './catalogue.schemas';
import type { z } from 'zod';

type CreateTestInput = z.infer<typeof createTestSchema>;
type UpdateTestInput = z.infer<typeof updateTestSchema>;
type AdminCreateTestInput = z.infer<typeof adminCreateTestSchema>;
type CreatePackageInput = z.infer<typeof createPackageSchema>;
type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
type AdminCreatePackageInput = z.infer<typeof adminCreatePackageSchema>;
type PublicSearchQuery = z.infer<typeof publicTestSearchSchema>;

async function requireApprovedLabById(labId: string) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { id: labId } });
  if (!lab || lab.verificationStatus !== DiagnosticLabVerificationStatus.APPROVED) {
    throw new BadRequestError('Lab not found or not approved');
  }
  return lab;
}

async function testById(testId: string) {
  const test = await prisma.diagnosticTest.findUnique({ where: { id: testId } });
  if (!test) throw new NotFoundError('Test not found');
  return test;
}

export async function listTestsForLab(labId: string) {
  return prisma.diagnosticTest.findMany({ where: { labId }, orderBy: { createdAt: 'desc' } });
}

export async function listMyTests(userId: string) {
  const lab = await ensureLabProfile(userId);
  return listTestsForLab(lab.id);
}

async function ownedTest(userId: string, testId: string) {
  const lab = await ensureLabProfile(userId);
  const test = await prisma.diagnosticTest.findFirst({ where: { id: testId, labId: lab.id } });
  if (!test) throw new NotFoundError('Test not found');
  return test;
}

export async function createTestForLab(labId: string, dto: CreateTestInput) {
  const existing = await prisma.diagnosticTest.findFirst({ where: { labId, code: dto.code } });
  if (existing) throw new BadRequestError('This lab already has a test with this code');
  return prisma.diagnosticTest.create({ data: { ...dto, labId } });
}

export async function createTest(userId: string, dto: CreateTestInput) {
  const lab = await ensureLabProfile(userId);
  return createTestForLab(lab.id, dto);
}

export async function updateTestById(testId: string, dto: UpdateTestInput) {
  const test = await testById(testId);
  return prisma.diagnosticTest.update({ where: { id: test.id }, data: dto });
}

export async function updateTest(userId: string, testId: string, dto: UpdateTestInput) {
  const test = await ownedTest(userId, testId);
  return updateTestById(test.id, dto);
}

export async function removeTestById(testId: string) {
  const test = await testById(testId);
  await prisma.diagnosticTest.delete({ where: { id: test.id } });
}

export async function removeTest(userId: string, testId: string) {
  const test = await ownedTest(userId, testId);
  await removeTestById(test.id);
}

// Admin equivalents of the lab-partner CRUD above, scoped by an
// admin-chosen labId instead of the caller's own session — see
// docs/admin-portal-status-report.md §D. Thin wrappers over the same
// *ForLab/*ById primitives, plus the audit trail a lab partner's own
// self-service actions don't carry.
export async function adminListTests(labId?: string) {
  return prisma.diagnosticTest.findMany({
    where: labId ? { labId } : undefined,
    include: { lab: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function adminCreateTest(dto: AdminCreateTestInput, auditCtx: AuditContext) {
  const { labId, ...rest } = dto;
  await requireApprovedLabById(labId);
  const test = await createTestForLab(labId, rest);
  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'DIAGNOSTIC_TEST_CREATED',
    resourceType: 'DiagnosticTest',
    resourceId: test.id,
    metadata: { labId, price: test.price },
  });
  return test;
}

export async function adminUpdateTest(testId: string, dto: UpdateTestInput, auditCtx: AuditContext) {
  const test = await updateTestById(testId, dto);
  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'DIAGNOSTIC_TEST_UPDATED',
    resourceType: 'DiagnosticTest',
    resourceId: test.id,
    metadata: { fields: Object.keys(dto) },
  });
  return test;
}

export async function adminRemoveTest(testId: string, auditCtx: AuditContext) {
  await removeTestById(testId);
  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'DIAGNOSTIC_TEST_REMOVED',
    resourceType: 'DiagnosticTest',
    resourceId: testId,
  });
}

// ENTERPRISE-6 — package CRUD, direct pattern reuse of the test CRUD
// above. testIds is validated as belonging to this lab (a package can't
// bundle a test the lab doesn't actually run) before the join rows are
// written.
async function validatedOwnTestIds(labId: string, testIds: string[]): Promise<string[]> {
  const owned = await prisma.diagnosticTest.findMany({ where: { id: { in: testIds }, labId }, select: { id: true } });
  if (owned.length !== testIds.length) throw new BadRequestError('One or more tests are not in your catalogue');
  return owned.map((t) => t.id);
}

export async function listPackagesForLab(labId: string) {
  return prisma.diagnosticPackage.findMany({
    where: { labId },
    include: { tests: { include: { test: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMyPackages(userId: string) {
  const lab = await ensureLabProfile(userId);
  return listPackagesForLab(lab.id);
}

async function packageById(packageId: string) {
  const pkg = await prisma.diagnosticPackage.findUnique({ where: { id: packageId } });
  if (!pkg) throw new NotFoundError('Package not found');
  return pkg;
}

async function ownedPackage(userId: string, packageId: string) {
  const lab = await ensureLabProfile(userId);
  const pkg = await prisma.diagnosticPackage.findFirst({ where: { id: packageId, labId: lab.id } });
  if (!pkg) throw new NotFoundError('Package not found');
  return { lab, pkg };
}

export async function createPackageForLab(labId: string, dto: CreatePackageInput) {
  const testIds = await validatedOwnTestIds(labId, dto.testIds);
  return prisma.diagnosticPackage.create({
    data: {
      labId,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      active: dto.active,
      tests: { create: testIds.map((testId) => ({ testId })) },
    },
    include: { tests: { include: { test: { select: { id: true, name: true } } } } },
  });
}

export async function createPackage(userId: string, dto: CreatePackageInput) {
  const lab = await ensureLabProfile(userId);
  return createPackageForLab(lab.id, dto);
}

export async function updatePackageById(packageId: string, dto: UpdatePackageInput) {
  const pkg = await packageById(packageId);
  const { testIds, ...rest } = dto;

  if (testIds) {
    const validatedIds = await validatedOwnTestIds(pkg.labId, testIds);
    await prisma.$transaction([
      prisma.diagnosticPackageTest.deleteMany({ where: { packageId: pkg.id } }),
      prisma.diagnosticPackageTest.createMany({ data: validatedIds.map((testId) => ({ packageId: pkg.id, testId })) }),
    ]);
  }

  return prisma.diagnosticPackage.update({
    where: { id: pkg.id },
    data: rest,
    include: { tests: { include: { test: { select: { id: true, name: true } } } } },
  });
}

export async function updatePackage(userId: string, packageId: string, dto: UpdatePackageInput) {
  const { pkg } = await ownedPackage(userId, packageId);
  return updatePackageById(pkg.id, dto);
}

export async function removePackageById(packageId: string) {
  const pkg = await packageById(packageId);
  await prisma.diagnosticPackage.delete({ where: { id: pkg.id } });
}

export async function removePackage(userId: string, packageId: string) {
  const { pkg } = await ownedPackage(userId, packageId);
  await removePackageById(pkg.id);
}

// Admin equivalents, mirroring the test admin wrappers above.
export async function adminListPackages(labId?: string) {
  return prisma.diagnosticPackage.findMany({
    where: labId ? { labId } : undefined,
    include: {
      lab: { select: { id: true, name: true } },
      tests: { include: { test: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function adminCreatePackage(dto: AdminCreatePackageInput, auditCtx: AuditContext) {
  const { labId, ...rest } = dto;
  await requireApprovedLabById(labId);
  const pkg = await createPackageForLab(labId, rest);
  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'DIAGNOSTIC_PACKAGE_CREATED',
    resourceType: 'DiagnosticPackage',
    resourceId: pkg.id,
    metadata: { labId, price: pkg.price },
  });
  return pkg;
}

export async function adminUpdatePackage(packageId: string, dto: UpdatePackageInput, auditCtx: AuditContext) {
  const pkg = await updatePackageById(packageId, dto);
  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'DIAGNOSTIC_PACKAGE_UPDATED',
    resourceType: 'DiagnosticPackage',
    resourceId: pkg.id,
    metadata: { fields: Object.keys(dto) },
  });
  return pkg;
}

export async function adminRemovePackage(packageId: string, auditCtx: AuditContext) {
  await removePackageById(packageId);
  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'DIAGNOSTIC_PACKAGE_REMOVED',
    resourceType: 'DiagnosticPackage',
    resourceId: packageId,
  });
}

export interface PublicTest {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sampleType: string | null;
  preparationInstructions: string | null;
  price: number;
  turnaroundHours: number | null;
  lab: { id: string; name: string | null; serviceCities: string[]; homeCollectionSupported: boolean };
}

export async function searchPublic(query: PublicSearchQuery) {
  const take = query.limit ?? 24;
  const skip = query.offset ?? 0;

  const labWhere: Prisma.DiagnosticLabWhereInput = { verificationStatus: 'APPROVED', active: true };
  if (query.city) labWhere.serviceCities = { has: query.city };

  const where: Prisma.DiagnosticTestWhereInput = {
    active: true,
    lab: labWhere,
  };
  if (query.q) {
    const words = query.q.trim().split(/\s+/).filter(Boolean);
    where.AND = words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' as const } },
        { description: { contains: word, mode: 'insensitive' as const } },
        { code: { contains: word, mode: 'insensitive' as const } },
      ],
    }));
  }

  const [total, rows] = await prisma.$transaction([
    prisma.diagnosticTest.count({ where }),
    prisma.diagnosticTest.findMany({
      where,
      include: { lab: { select: { id: true, name: true, serviceCities: true, homeCollectionSupported: true } } },
      orderBy: { name: 'asc' },
      take,
      skip,
    }),
  ]);

  const tests: PublicTest[] = rows.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    sampleType: t.sampleType,
    preparationInstructions: t.preparationInstructions,
    price: t.price,
    turnaroundHours: t.turnaroundHours,
    lab: t.lab,
  }));

  return { total, tests };
}

export interface PublicPackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  testNames: string[];
  lab: { id: string; name: string | null; serviceCities: string[]; homeCollectionSupported: boolean };
}

export async function searchPackagesPublic(query: PublicSearchQuery) {
  const take = query.limit ?? 24;
  const skip = query.offset ?? 0;

  const labWhere: Prisma.DiagnosticLabWhereInput = { verificationStatus: 'APPROVED', active: true };
  if (query.city) labWhere.serviceCities = { has: query.city };

  const where: Prisma.DiagnosticPackageWhereInput = { active: true, lab: labWhere };
  if (query.q) {
    const words = query.q.trim().split(/\s+/).filter(Boolean);
    where.AND = words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' as const } },
        { description: { contains: word, mode: 'insensitive' as const } },
      ],
    }));
  }

  const [total, rows] = await prisma.$transaction([
    prisma.diagnosticPackage.count({ where }),
    prisma.diagnosticPackage.findMany({
      where,
      include: {
        lab: { select: { id: true, name: true, serviceCities: true, homeCollectionSupported: true } },
        tests: { include: { test: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
      take,
      skip,
    }),
  ]);

  const packages: PublicPackage[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    testNames: p.tests.map((t) => t.test.name),
    lab: p.lab,
  }));

  return { total, packages };
}

export async function facets() {
  const tests = await prisma.diagnosticTest.findMany({
    where: { active: true, lab: { verificationStatus: 'APPROVED', active: true } },
    select: { lab: { select: { serviceCities: true } } },
  });
  const cities = [...new Set(tests.flatMap((t) => t.lab.serviceCities))].sort((a, b) => a.localeCompare(b));
  return { cities };
}

// Any active test at an approved+active lab — used to populate the "link
// to a catalogue entry" option on a doctor's recommendation form. Not
// scoped to one lab since a recommendation is clinical intent, not a
// specific booking (docs/DOMAIN-MODEL.md §7).
export async function listActiveForRecommendation() {
  const tests = await prisma.diagnosticTest.findMany({
    where: { active: true, lab: { verificationStatus: 'APPROVED', active: true } },
    include: { lab: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  return tests.map((t) => ({ id: t.id, name: t.name, labName: t.lab.name }));
}

export async function listActivePackagesForRecommendation() {
  const packages = await prisma.diagnosticPackage.findMany({
    where: { active: true, lab: { verificationStatus: 'APPROVED', active: true } },
    include: { lab: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  return packages.map((p) => ({ id: p.id, name: p.name, labName: p.lab.name }));
}
