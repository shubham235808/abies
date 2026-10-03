import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { ensureLabProfile } from './labs.service';
import type { createPackageSchema, createTestSchema, publicTestSearchSchema, updatePackageSchema, updateTestSchema } from './catalogue.schemas';
import type { z } from 'zod';

type CreateTestInput = z.infer<typeof createTestSchema>;
type UpdateTestInput = z.infer<typeof updateTestSchema>;
type CreatePackageInput = z.infer<typeof createPackageSchema>;
type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
type PublicSearchQuery = z.infer<typeof publicTestSearchSchema>;

export async function listMyTests(userId: string) {
  const lab = await ensureLabProfile(userId);
  return prisma.diagnosticTest.findMany({ where: { labId: lab.id }, orderBy: { createdAt: 'desc' } });
}

async function ownedTest(userId: string, testId: string) {
  const lab = await ensureLabProfile(userId);
  const test = await prisma.diagnosticTest.findFirst({ where: { id: testId, labId: lab.id } });
  if (!test) throw new NotFoundError('Test not found');
  return test;
}

export async function createTest(userId: string, dto: CreateTestInput) {
  const lab = await ensureLabProfile(userId);
  const existing = await prisma.diagnosticTest.findFirst({ where: { labId: lab.id, code: dto.code } });
  if (existing) throw new BadRequestError('You already have a test with this code');
  return prisma.diagnosticTest.create({ data: { ...dto, labId: lab.id } });
}

export async function updateTest(userId: string, testId: string, dto: UpdateTestInput) {
  const test = await ownedTest(userId, testId);
  return prisma.diagnosticTest.update({ where: { id: test.id }, data: dto });
}

export async function removeTest(userId: string, testId: string) {
  const test = await ownedTest(userId, testId);
  await prisma.diagnosticTest.delete({ where: { id: test.id } });
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

export async function listMyPackages(userId: string) {
  const lab = await ensureLabProfile(userId);
  return prisma.diagnosticPackage.findMany({
    where: { labId: lab.id },
    include: { tests: { include: { test: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function ownedPackage(userId: string, packageId: string) {
  const lab = await ensureLabProfile(userId);
  const pkg = await prisma.diagnosticPackage.findFirst({ where: { id: packageId, labId: lab.id } });
  if (!pkg) throw new NotFoundError('Package not found');
  return { lab, pkg };
}

export async function createPackage(userId: string, dto: CreatePackageInput) {
  const lab = await ensureLabProfile(userId);
  const testIds = await validatedOwnTestIds(lab.id, dto.testIds);
  return prisma.diagnosticPackage.create({
    data: {
      labId: lab.id,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      active: dto.active,
      tests: { create: testIds.map((testId) => ({ testId })) },
    },
    include: { tests: { include: { test: { select: { id: true, name: true } } } } },
  });
}

export async function updatePackage(userId: string, packageId: string, dto: UpdatePackageInput) {
  const { lab, pkg } = await ownedPackage(userId, packageId);
  const { testIds, ...rest } = dto;

  if (testIds) {
    const validatedIds = await validatedOwnTestIds(lab.id, testIds);
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

export async function removePackage(userId: string, packageId: string) {
  const { pkg } = await ownedPackage(userId, packageId);
  await prisma.diagnosticPackage.delete({ where: { id: pkg.id } });
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
