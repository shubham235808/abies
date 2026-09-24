import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { ensureLabProfile } from './labs.service';
import type { createTestSchema, publicTestSearchSchema, updateTestSchema } from './catalogue.schemas';
import type { z } from 'zod';

type CreateTestInput = z.infer<typeof createTestSchema>;
type UpdateTestInput = z.infer<typeof updateTestSchema>;
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
