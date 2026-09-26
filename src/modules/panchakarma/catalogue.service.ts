import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { ensureCentreProfile } from './centres.service';
import type { createTherapistSchema, createTherapySchema, publicTherapySearchSchema, updateTherapistSchema, updateTherapySchema } from './catalogue.schemas';
import type { z } from 'zod';

type CreateTherapyInput = z.infer<typeof createTherapySchema>;
type UpdateTherapyInput = z.infer<typeof updateTherapySchema>;
type CreateTherapistInput = z.infer<typeof createTherapistSchema>;
type UpdateTherapistInput = z.infer<typeof updateTherapistSchema>;
type PublicSearchQuery = z.infer<typeof publicTherapySearchSchema>;

export async function listMyTherapies(userId: string) {
  const centre = await ensureCentreProfile(userId);
  return prisma.therapy.findMany({ where: { centreId: centre.id }, orderBy: { createdAt: 'desc' } });
}

async function ownedTherapy(userId: string, therapyId: string) {
  const centre = await ensureCentreProfile(userId);
  const therapy = await prisma.therapy.findFirst({ where: { id: therapyId, centreId: centre.id } });
  if (!therapy) throw new NotFoundError('Therapy not found');
  return therapy;
}

export async function createTherapy(userId: string, dto: CreateTherapyInput) {
  const centre = await ensureCentreProfile(userId);
  return prisma.therapy.create({ data: { ...dto, centreId: centre.id } });
}

export async function updateTherapy(userId: string, therapyId: string, dto: UpdateTherapyInput) {
  const therapy = await ownedTherapy(userId, therapyId);
  return prisma.therapy.update({ where: { id: therapy.id }, data: dto });
}

export async function removeTherapy(userId: string, therapyId: string) {
  const therapy = await ownedTherapy(userId, therapyId);
  await prisma.therapy.delete({ where: { id: therapy.id } });
}

export async function listMyTherapists(userId: string) {
  const centre = await ensureCentreProfile(userId);
  return prisma.therapist.findMany({ where: { centreId: centre.id }, orderBy: { createdAt: 'desc' } });
}

async function ownedTherapist(userId: string, therapistId: string) {
  const centre = await ensureCentreProfile(userId);
  const therapist = await prisma.therapist.findFirst({ where: { id: therapistId, centreId: centre.id } });
  if (!therapist) throw new NotFoundError('Therapist not found');
  return therapist;
}

export async function createTherapist(userId: string, dto: CreateTherapistInput) {
  const centre = await ensureCentreProfile(userId);
  return prisma.therapist.create({ data: { ...dto, centreId: centre.id } });
}

export async function updateTherapist(userId: string, therapistId: string, dto: UpdateTherapistInput) {
  const therapist = await ownedTherapist(userId, therapistId);
  return prisma.therapist.update({ where: { id: therapist.id }, data: dto });
}

export async function removeTherapist(userId: string, therapistId: string) {
  const therapist = await ownedTherapist(userId, therapistId);
  const activeSession = await prisma.panchakarmaSession.findFirst({ where: { therapistId: therapist.id, attendedAt: null } });
  if (activeSession) throw new BadRequestError('Reassign this therapist’s upcoming sessions before removing them');
  await prisma.therapist.delete({ where: { id: therapist.id } });
}

export interface PublicTherapy {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  contraindications: string | null;
  price: number;
  requiredSupervision: boolean;
  centre: { id: string; name: string | null; city: string | null; state: string | null };
}

export async function searchPublic(query: PublicSearchQuery) {
  const take = query.limit ?? 24;
  const skip = query.offset ?? 0;

  const centreWhere: Prisma.PanchakarmaCentreWhereInput = { verificationStatus: 'APPROVED', active: true };
  if (query.city) centreWhere.city = query.city;

  const where: Prisma.TherapyWhereInput = {
    active: true,
    centre: centreWhere,
  };
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
    prisma.therapy.count({ where }),
    prisma.therapy.findMany({
      where,
      include: { centre: { select: { id: true, name: true, city: true, state: true } } },
      orderBy: { name: 'asc' },
      take,
      skip,
    }),
  ]);

  const therapies: PublicTherapy[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    durationMinutes: t.durationMinutes,
    prerequisites: t.prerequisites,
    contraindications: t.contraindications,
    price: t.price,
    requiredSupervision: t.requiredSupervision,
    centre: t.centre,
  }));

  return { total, therapies };
}

export async function facets() {
  const centres = await prisma.panchakarmaCentre.findMany({
    where: { verificationStatus: 'APPROVED', active: true, therapies: { some: { active: true } } },
    select: { city: true },
  });
  const cities = [...new Set(centres.map((c) => c.city).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b));
  return { cities };
}

// Any active therapy at an approved+active centre — populates the "link to
// a catalogue entry" option on a doctor's recommendation form, mirroring
// modules/diagnostics/catalogue.service.ts's listActiveForRecommendation.
export async function listActiveForRecommendation() {
  const therapies = await prisma.therapy.findMany({
    where: { active: true, centre: { verificationStatus: 'APPROVED', active: true } },
    include: { centre: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  return therapies.map((t) => ({ id: t.id, name: t.name, centreName: t.centre.name }));
}
