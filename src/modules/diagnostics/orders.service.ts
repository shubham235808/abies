import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '@/lib/errors';
import { assertUploadAllowed, getSignedDownloadUrl, putObject } from '@/lib/storage';
import { createOrder, isConfigured, verifySignature } from '@/lib/payments/razorpay';
import { notify } from '@/modules/notifications/notifications.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type {
  bookOrderSchema,
  cancelOrderSchema,
  releaseReportSchema,
  sampleCollectedSchema,
  verifyOrderPaymentSchema,
} from './orders.schemas';
import type { z } from 'zod';

type BookOrderInput = z.infer<typeof bookOrderSchema>;
type VerifyOrderPaymentInput = z.infer<typeof verifyOrderPaymentSchema>;
type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
type SampleCollectedInput = z.infer<typeof sampleCollectedSchema>;
type ReleaseReportInput = z.infer<typeof releaseReportSchema>;

async function releaseOrder(orderId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.diagnosticOrder.findUnique({ where: { id: orderId } });
    if (!order) return;
    await tx.diagnosticOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
    });
    if (order.paymentId) await tx.payment.update({ where: { id: order.paymentId }, data: { status: 'FAILED' } });
    if (order.recommendationId) {
      await tx.diagnosticRecommendation.update({ where: { id: order.recommendationId }, data: { status: 'RECOMMENDED' } });
    }
  });
}

export async function bookOrder(patientUserId: string, dto: BookOrderInput) {
  if (!isConfigured()) {
    throw new ServiceUnavailableError('Online payments are not configured in this environment yet — booking is unavailable.');
  }

  const lab = await prisma.diagnosticLab.findFirst({ where: { id: dto.labId, verificationStatus: 'APPROVED', active: true } });
  if (!lab) throw new NotFoundError('Lab not found');

  if (dto.collectionMode === 'HOME') {
    if (!lab.homeCollectionSupported) throw new BadRequestError('This lab does not support home sample collection');
    if (!dto.address) throw new BadRequestError('Address is required for home collection');
  }

  const scheduledAt = new Date(dto.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 5 * 60_000) {
    throw new BadRequestError('Invalid or past scheduled time');
  }

  const tests = await prisma.diagnosticTest.findMany({ where: { id: { in: dto.testIds }, labId: lab.id, active: true } });
  if (tests.length !== dto.testIds.length) throw new BadRequestError('One or more tests are unavailable at this lab');
  const totalPrice = tests.reduce((sum, t) => sum + t.price, 0);

  if (dto.recommendationId) {
    // Checked in this order deliberately: a BOOKED recommendation still
    // exists (it's just already fulfilled), so it must get the specific
    // "already has an active order" message — filtering the existence
    // lookup itself by status: 'RECOMMENDED' would make that case look
    // like the recommendation doesn't exist at all.
    const recommendation = await prisma.diagnosticRecommendation.findFirst({
      where: { id: dto.recommendationId, patientUserId },
    });
    if (!recommendation) throw new NotFoundError('Recommendation not found');
    const existingActiveOrder = await prisma.diagnosticOrder.findFirst({
      where: { recommendationId: dto.recommendationId, status: { not: 'CANCELLED' } },
    });
    if (existingActiveOrder) throw new ConflictError('This recommendation already has an active order');
    if (recommendation.status !== 'RECOMMENDED') {
      throw new ConflictError('This recommendation is not available for booking');
    }
  }

  const { order, paymentId } = await prisma.$transaction(async (tx) => {
    const created = await tx.diagnosticOrder.create({
      data: {
        recommendationId: dto.recommendationId,
        patientUserId,
        labId: lab.id,
        collectionMode: dto.collectionMode,
        scheduledAt,
        address: dto.collectionMode === 'HOME' ? dto.address : undefined,
        items: { create: tests.map((t) => ({ testId: t.id, price: t.price })) },
      },
    });
    const payment = await tx.payment.create({
      data: { payerUserId: patientUserId, purpose: 'DIAGNOSTIC_ORDER', purposeEntityId: created.id, amount: totalPrice, status: 'CREATED' },
    });
    const order = await tx.diagnosticOrder.update({ where: { id: created.id }, data: { paymentId: payment.id } });
    if (dto.recommendationId) {
      await tx.diagnosticRecommendation.update({ where: { id: dto.recommendationId }, data: { status: 'BOOKED' } });
    }
    return { order, paymentId: payment.id };
  });

  try {
    const gatewayOrder = await createOrder({
      amountRupees: totalPrice,
      receipt: order.id,
      notes: { diagnosticOrderId: order.id, labId: lab.id },
    });
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: { gatewayOrderId: gatewayOrder.id, status: 'PENDING' },
    });
    return { order, payment: updatedPayment, razorpayOrder: gatewayOrder, razorpayKeyId: getEnv().RAZORPAY_KEY_ID };
  } catch (err) {
    await releaseOrder(order.id, 'Payment gateway error while starting checkout');
    logger.error('diagnostics', 'razorpay order creation failed', err, { orderId: order.id });
    throw new ServiceUnavailableError('Could not start payment — please try again.');
  }
}

// Shared by the checkout-verification route and the webhook, keyed by the
// gateway order id — idempotent, same pattern as
// modules/appointments/appointments.service.ts's finalizePaymentSuccessByOrder.
export async function finalizeOrderPaymentByOrder(params: { gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { gatewayOrderId: params.gatewayOrderId } });
    if (!payment) throw new NotFoundError('Payment not found for this order');
    if (payment.status === 'SUCCESS') {
      return tx.diagnosticOrder.findUniqueOrThrow({ where: { paymentId: payment.id } });
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        gatewayPaymentId: params.gatewayPaymentId,
        gatewaySignature: params.gatewaySignature,
        verifiedAt: new Date(),
      },
    });
    return tx.diagnosticOrder.update({ where: { paymentId: payment.id }, data: { status: 'SCHEDULED' } });
  });
}

export async function verifyOrderPayment(patientUserId: string, dto: VerifyOrderPaymentInput, auditCtx: AuditContext) {
  const order = await prisma.diagnosticOrder.findFirst({ where: { id: dto.orderId, patientUserId }, include: { payment: true, lab: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'BOOKED' || !order.payment) throw new ConflictError('This order is not awaiting payment');
  if (order.payment.gatewayOrderId !== dto.razorpayOrderId) throw new BadRequestError('Order mismatch');

  const valid = verifySignature({
    orderId: dto.razorpayOrderId,
    paymentId: dto.razorpayPaymentId,
    signature: dto.razorpaySignature,
  });
  if (!valid) {
    await prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'FAILED' } });
    throw new BadRequestError('Payment verification failed');
  }

  const confirmed = await finalizeOrderPaymentByOrder({
    gatewayOrderId: dto.razorpayOrderId,
    gatewayPaymentId: dto.razorpayPaymentId,
    gatewaySignature: dto.razorpaySignature,
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'DIAGNOSTIC_ORDER',
    action: 'CONFIRMED',
    resourceType: 'DiagnosticOrder',
    resourceId: order.id,
  });
  await notify(patientUserId, 'IN_APP', 'diagnostic.order_confirmed', { orderId: order.id });
  await notify(order.lab.userId, 'IN_APP', 'diagnostic.order_booked', { orderId: order.id });

  return confirmed;
}

export async function cancelOrder(actorUserId: string, role: UserRole, orderId: string, dto: CancelOrderInput, auditCtx: AuditContext) {
  const order = await prisma.diagnosticOrder.findUnique({ where: { id: orderId }, include: { lab: true } });
  if (!order) throw new NotFoundError('Order not found');

  const isOwnerPatient = role === 'PATIENT' && order.patientUserId === actorUserId;
  const isOwnerLab = role === 'LAB' && order.lab.userId === actorUserId;
  if (!isOwnerPatient && !isOwnerLab) throw new ForbiddenError('Not allowed to cancel this order');

  if (order.status !== 'BOOKED' && order.status !== 'SCHEDULED') {
    throw new ConflictError('This order can no longer be cancelled');
  }

  await prisma.$transaction(async (tx) => {
    await tx.diagnosticOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: dto.reason },
    });
    if (order.recommendationId) {
      await tx.diagnosticRecommendation.update({ where: { id: order.recommendationId }, data: { status: 'RECOMMENDED' } });
    }
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'DIAGNOSTIC_ORDER',
    action: 'CANCELLED',
    resourceType: 'DiagnosticOrder',
    resourceId: orderId,
    metadata: { cancelledBy: role },
  });

  const notifyUserId = isOwnerPatient ? order.lab.userId : order.patientUserId;
  await notify(notifyUserId, 'IN_APP', 'diagnostic.order_cancelled', { orderId });

  return prisma.diagnosticOrder.findUniqueOrThrow({ where: { id: orderId } });
}

async function ownedByLab(labUserId: string, orderId: string) {
  const order = await prisma.diagnosticOrder.findUnique({ where: { id: orderId }, include: { lab: true } });
  if (!order || order.lab.userId !== labUserId) throw new NotFoundError('Order not found');
  return order;
}

export async function markSampleCollected(labUserId: string, orderId: string, dto: SampleCollectedInput) {
  const order = await ownedByLab(labUserId, orderId);
  if (order.status !== 'SCHEDULED') throw new BadRequestError('Only a scheduled order can have its sample collected');

  const [, updatedOrder] = await prisma.$transaction([
    prisma.sampleCollection.upsert({
      where: { diagnosticOrderId: orderId },
      update: { ...dto, collectedAt: new Date() },
      create: { diagnosticOrderId: orderId, ...dto, collectedAt: new Date() },
    }),
    prisma.diagnosticOrder.update({ where: { id: orderId }, data: { status: 'SAMPLE_COLLECTED' } }),
  ]);
  await notify(order.patientUserId, 'IN_APP', 'diagnostic.sample_collected', { orderId });
  return updatedOrder;
}

export async function markProcessing(labUserId: string, orderId: string) {
  const order = await ownedByLab(labUserId, orderId);
  if (order.status !== 'SAMPLE_COLLECTED') throw new BadRequestError('Only a collected sample can move to processing');
  return prisma.diagnosticOrder.update({ where: { id: orderId }, data: { status: 'PROCESSING' } });
}

export interface UploadedFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

export async function releaseReport(labUserId: string, orderId: string, dto: ReleaseReportInput, file: UploadedFile | null, auditCtx: AuditContext) {
  const order = await ownedByLab(labUserId, orderId);
  if (order.status !== 'PROCESSING') throw new BadRequestError('Only a processing order can have its report released');

  let documentStorageKey: string | undefined;
  if (file) {
    assertUploadAllowed({ mimetype: file.mimeType, size: file.size });
    documentStorageKey = `diagnostic-reports/${orderId}/${Date.now()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await putObject({ key: documentStorageKey, body: file.buffer, contentType: file.mimeType });
  }

  const { report, updatedOrder } = await prisma.$transaction(async (tx) => {
    const report = await tx.diagnosticReport.create({
      data: {
        diagnosticOrderId: orderId,
        structuredResults: dto.structuredResults as never,
        documentStorageKey,
        criticalFlag: dto.criticalFlag ?? false,
        releasedToPatientAt: new Date(),
      },
    });
    const updatedOrder = await tx.diagnosticOrder.update({ where: { id: orderId }, data: { status: 'COMPLETED' } });
    await tx.report.create({
      data: {
        patientUserId: order.patientUserId,
        kind: 'DIAGNOSTIC_REPORT',
        sourceEntityType: 'DiagnosticOrder',
        sourceEntityId: orderId,
        storageKey: documentStorageKey ?? '',
        uploadedByUserId: labUserId,
      },
    });
    if (order.recommendationId) {
      await tx.diagnosticRecommendation.update({ where: { id: order.recommendationId }, data: { status: 'FULFILLED' } });
    }
    return { report, updatedOrder };
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'DIAGNOSTIC_REPORT',
    action: 'RELEASED',
    resourceType: 'DiagnosticReport',
    resourceId: report.id,
    metadata: { criticalFlag: report.criticalFlag },
  });
  await notify(order.patientUserId, 'IN_APP', 'diagnostic.report_ready', { orderId });

  if (order.recommendationId) {
    const recommendation = await prisma.diagnosticRecommendation.findUnique({
      where: { id: order.recommendationId },
      include: { doctorProfile: true },
    });
    if (recommendation) {
      await prisma.diagnosticReport.update({ where: { id: report.id }, data: { notifiedDoctorAt: new Date() } });
      await notify(recommendation.doctorProfile.userId, 'IN_APP', report.criticalFlag ? 'diagnostic.report_critical' : 'diagnostic.report_ready', {
        orderId,
      });
    }
  }

  return updatedOrder;
}

export async function acknowledgeReport(doctorUserId: string, orderId: string) {
  const order = await prisma.diagnosticOrder.findUnique({
    where: { id: orderId },
    include: { report: true, recommendation: { include: { doctorProfile: true } } },
  });
  if (!order || !order.report || !order.recommendation || order.recommendation.doctorProfile.userId !== doctorUserId) {
    throw new NotFoundError('Report not found');
  }
  return prisma.diagnosticReport.update({ where: { id: order.report.id }, data: { doctorAcknowledgedAt: new Date() } });
}

function detailInclude() {
  return {
    lab: { select: { id: true, name: true, serviceCities: true } },
    patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
    items: { include: { test: { select: { name: true, code: true } } } },
    sampleCollection: true,
    report: true,
    payment: { select: { status: true, amount: true } },
  };
}

export async function getOrder(userId: string, role: UserRole, orderId: string) {
  const order = await prisma.diagnosticOrder.findUnique({ where: { id: orderId }, include: { ...detailInclude(), lab: true } });
  if (!order) throw new NotFoundError('Order not found');
  const isPatient = role === 'PATIENT' && order.patientUserId === userId;
  const isLab = role === 'LAB' && order.lab.userId === userId;
  if (!isPatient && !isLab) throw new NotFoundError('Order not found');
  return order;
}

export async function listMineAsPatient(patientUserId: string) {
  return prisma.diagnosticOrder.findMany({
    where: { patientUserId },
    include: { lab: { select: { name: true } }, items: { include: { test: { select: { name: true } } } }, report: { select: { releasedToPatientAt: true, criticalFlag: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMineAsLab(labUserId: string) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { userId: labUserId } });
  if (!lab) throw new NotFoundError('Lab profile not found');
  return prisma.diagnosticOrder.findMany({
    where: { labId: lab.id, status: { not: 'BOOKED' } },
    include: {
      patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
      items: { include: { test: { select: { name: true } } } },
      report: { select: { criticalFlag: true, doctorAcknowledgedAt: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });
}

export async function getReportDownloadUrlForDoctor(doctorUserId: string, orderId: string): Promise<string> {
  const order = await prisma.diagnosticOrder.findUnique({
    where: { id: orderId },
    include: { report: true, recommendation: { include: { doctorProfile: true } } },
  });
  if (!order || !order.report?.documentStorageKey || !order.recommendation || order.recommendation.doctorProfile.userId !== doctorUserId) {
    throw new NotFoundError('Report not found');
  }
  return getSignedDownloadUrl(order.report.documentStorageKey);
}
