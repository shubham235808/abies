import { prisma } from '../../lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
import type { createDoctorReviewSchema, createMedicineReviewSchema, moderateReviewSchema } from './reviews.schemas';
import type { z } from 'zod';

type CreateDoctorReviewInput = z.infer<typeof createDoctorReviewSchema>;
type CreateMedicineReviewInput = z.infer<typeof createMedicineReviewSchema>;
type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

// EXPANSION-1c — a rating only counts toward the displayed/sorted
// aggregate once at least this many published reviews exist, so a single
// early review (good or bad) can't swing a new doctor/product's standing.
// Below the threshold the aggregate stays 0 (display falls back to "New"
// / no badge; sort falls through to the next tie-break key).
const MIN_SAMPLE_SIZE = 3;

async function recomputeDoctorRating(doctorProfileId: string) {
  const agg = await prisma.review.aggregate({
    where: { targetType: 'DOCTOR', targetId: doctorProfileId, status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: true,
  });
  const count = agg._count;
  const rating = count >= MIN_SAMPLE_SIZE ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : 0;
  await prisma.doctorProfile.update({ where: { id: doctorProfileId }, data: { rating, reviewCount: count } });
}

async function recomputeMedicineRating(medicineId: string) {
  const agg = await prisma.review.aggregate({
    where: { targetType: 'MEDICINE', targetId: medicineId, status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: true,
  });
  const count = agg._count;
  const rating = count >= MIN_SAMPLE_SIZE ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : 0;
  await prisma.medicine.update({ where: { id: medicineId }, data: { rating, reviewCount: count } });
}

export async function reviewDoctor(patientUserId: string, appointmentId: string, dto: CreateDoctorReviewInput) {
  const appointment = await prisma.appointment.findFirst({ where: { id: appointmentId, patientUserId } });
  if (!appointment) throw new NotFoundError('Appointment not found');
  if (appointment.status !== 'COMPLETED') {
    throw new BadRequestError('You can only review a doctor after a completed appointment');
  }

  const existing = await prisma.review.findFirst({
    where: { authorUserId: patientUserId, targetType: 'DOCTOR', targetId: appointment.doctorProfileId, sourceType: 'APPOINTMENT', sourceId: appointment.id },
  });
  if (existing) throw new ConflictError('You already reviewed this appointment');

  const review = await prisma.review.create({
    data: {
      authorUserId: patientUserId,
      targetType: 'DOCTOR',
      targetId: appointment.doctorProfileId,
      sourceType: 'APPOINTMENT',
      sourceId: appointment.id,
      rating: dto.rating,
      comment: dto.comment,
    },
  });
  await recomputeDoctorRating(appointment.doctorProfileId);
  return review;
}

export async function reviewMedicine(patientUserId: string, orderId: string, dto: CreateMedicineReviewInput) {
  const order = await prisma.medicineOrder.findFirst({ where: { id: orderId, patientUserId }, include: { items: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'DELIVERED') throw new BadRequestError('You can only review items from a delivered order');
  if (!order.items.some((i) => i.medicineId === dto.medicineId)) {
    throw new BadRequestError('This item was not part of that order');
  }

  const existing = await prisma.review.findFirst({
    where: { authorUserId: patientUserId, targetType: 'MEDICINE', targetId: dto.medicineId, sourceType: 'MEDICINE_ORDER', sourceId: order.id },
  });
  if (existing) throw new ConflictError('You already reviewed this item from this order');

  const review = await prisma.review.create({
    data: {
      authorUserId: patientUserId,
      targetType: 'MEDICINE',
      targetId: dto.medicineId,
      sourceType: 'MEDICINE_ORDER',
      sourceId: order.id,
      rating: dto.rating,
      comment: dto.comment,
    },
  });
  await recomputeMedicineRating(dto.medicineId);
  return review;
}

export async function listForDoctor(doctorProfileId: string) {
  return prisma.review.findMany({
    where: { targetType: 'DOCTOR', targetId: doctorProfileId, status: 'PUBLISHED' },
    include: { author: { select: { patientProfile: { select: { firstName: true, lastName: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listForDoctorBySlug(slug: string) {
  const doctor = await prisma.doctorProfile.findFirst({ where: { slug, verificationStatus: 'APPROVED', isDiscoverable: true }, select: { id: true } });
  if (!doctor) throw new NotFoundError('Doctor not found');
  return listForDoctor(doctor.id);
}

export async function listForMedicine(medicineId: string) {
  return prisma.review.findMany({
    where: { targetType: 'MEDICINE', targetId: medicineId, status: 'PUBLISHED' },
    include: { author: { select: { patientProfile: { select: { firstName: true, lastName: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMine(patientUserId: string) {
  return prisma.review.findMany({ where: { authorUserId: patientUserId }, orderBy: { createdAt: 'desc' } });
}

// Admin moderation — reactive takedown, not pre-publication approval (a
// review is PUBLISHED immediately on creation; an admin can HIDE one
// after the fact, e.g. for abuse/spam). Matches this codebase's existing
// "no queue nobody asked for" discipline elsewhere.
export async function moderate(reviewId: string, dto: ModerateReviewInput, adminCtx: AuditContext & { userId: string }) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new NotFoundError('Review not found');

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: { status: dto.status, moderatedByUserId: adminCtx.userId, moderatedAt: new Date() },
  });

  if (review.targetType === 'DOCTOR') await recomputeDoctorRating(review.targetId);
  else await recomputeMedicineRating(review.targetId);

  await recordAuditEvent(adminCtx, {
    eventType: 'REVIEW_MODERATION',
    action: dto.status,
    resourceType: 'Review',
    resourceId: reviewId,
    metadata: { targetType: review.targetType, targetId: review.targetId },
  });
  return updated;
}
