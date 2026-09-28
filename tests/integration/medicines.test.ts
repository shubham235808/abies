// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { requestOtp, verifyOtp } from '@/modules/auth/auth.service';
import { approve as approveDoctor, reviewDocument } from '@/modules/doctors/admin-doctors.service';
import { addAvailability, addDocument, submit as submitDoctor, updateMe } from '@/modules/doctors/doctors.service';

const razorpayMock = vi.hoisted(() => ({
  isConfigured: vi.fn(() => true),
  createOrder: vi.fn(async (params: { amountRupees: number }) => ({
    id: `order_${Math.random().toString(36).slice(2)}`,
    amount: params.amountRupees * 100,
    currency: 'INR',
  })),
  verifySignature: vi.fn(() => true),
  verifyWebhookSignature: vi.fn(() => false),
}));
vi.mock('@/lib/payments/razorpay', () => razorpayMock);

import { holdSlot, verifyPayment } from '@/modules/appointments/appointments.service';
import { createPrescription, finalizePrescription } from '@/modules/consultations/prescriptions.service';
import { approve as approvePharmacy } from '@/modules/medicines/admin-pharmacies.service';
import { addInventory, searchPublic } from '@/modules/medicines/catalogue.service';
import { ensurePharmacyProfile, submitPharmacy, updateMyPharmacy } from '@/modules/medicines/pharmacies.service';
import {
  acceptOrder,
  bookOrder,
  cancelOrder,
  dispatchOrder,
  getOrder,
  listMineAsPharmacy,
  markDelivered,
  markPacking,
  matchPrescriptionAtPharmacy,
  verifyOrderPayment,
} from '@/modules/medicines/orders.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

function nextWeekdayAt(hour: number, minute: number, daysAhead = 2): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const createdUserIds: string[] = [];

async function registerUser(role: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'PHARMACY') {
  const mobile = freshMobile();
  if (role === 'ADMIN') await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  const { requestId } = await requestOtp(mobile, role);
  const { session } = await verifyOtp(requestId, '123456', true, {});
  createdUserIds.push(session.userId);
  return session.userId;
}

const pdf = { mimeType: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.4 test') };

async function approvedVideoDoctor(feeRupees = 500) {
  const doctorUserId = await registerUser('DOCTOR');
  await updateMe(
    doctorUserId,
    {
      firstName: 'Asha',
      lastName: 'Rao',
      registrationCouncil: 'Test Council',
      registrationNumber: `REG-${randomInt(100000000, 999999999)}`,
      primaryQualification: 'BAMS',
      yearsExperience: 8,
      specialties: ['General'],
      languages: ['English'],
      consultationModes: ['VIDEO'],
      videoFee: feeRupees,
    },
    { userId: doctorUserId },
  );
  await addDocument(doctorUserId, 'REGISTRATION_CERTIFICATE', { originalName: 'reg.pdf', ...pdf }, { userId: doctorUserId });
  await addDocument(doctorUserId, 'DEGREE_CERTIFICATE', { originalName: 'degree.pdf', ...pdf }, { userId: doctorUserId });
  await submitDoctor(doctorUserId, true, { userId: doctorUserId });

  const adminId = await registerUser('ADMIN');
  const doctorProfile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorUserId } });
  const docs = await prisma.doctorDocument.findMany({ where: { doctorProfileId: doctorProfile.id } });
  for (const doc of docs) await reviewDocument(doctorProfile.id, doc.id, { userId: adminId }, 'VERIFY');
  await approveDoctor(doctorProfile.id, { userId: adminId });

  const slotStart = nextWeekdayAt(9, 0);
  await addAvailability(doctorUserId, {
    dayOfWeek: slotStart.getDay(),
    startTime: '09:00',
    endTime: '10:00',
    mode: 'VIDEO',
    slotMinutes: 30,
  });

  return { doctorUserId, doctorProfileId: doctorProfile.id, slotStart };
}

async function confirmedAppointment() {
  const { doctorUserId, doctorProfileId, slotStart } = await approvedVideoDoctor();
  const patientId = await registerUser('PATIENT');

  const { appointment, razorpayOrder } = await holdSlot(patientId, {
    doctorProfileId,
    mode: 'VIDEO',
    startsAt: slotStart.toISOString(),
  });
  await verifyPayment(
    patientId,
    {
      appointmentId: appointment.id,
      razorpayOrderId: razorpayOrder.id,
      razorpayPaymentId: `pay_${randomInt(1_000_000, 9_999_999)}`,
      razorpaySignature: 'sig_x',
    },
    { userId: patientId },
  );

  const consultation = await prisma.consultation.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
  return { doctorUserId, patientId, consultationId: consultation.id };
}

async function approvedPharmacy() {
  const pharmacyUserId = await registerUser('PHARMACY');
  await updateMyPharmacy(
    pharmacyUserId,
    { name: 'Test Pharmacy', licenseNumbers: [`LIC-${randomInt(100000, 999999)}`], serviceAreas: ['Pune'] },
    { userId: pharmacyUserId },
  );
  await submitPharmacy(pharmacyUserId, true, { userId: pharmacyUserId });
  const adminId = await registerUser('ADMIN');
  const pharmacy = await ensurePharmacyProfile(pharmacyUserId);
  await approvePharmacy(pharmacy.id, { userId: adminId });
  return { pharmacyUserId, pharmacyId: pharmacy.id };
}

async function stockedOtcMedicine(pharmacyUserId: string, name = 'Cetirizine', quantity = 50, price = 30) {
  const item = await addInventory(pharmacyUserId, {
    name,
    requiresPrescription: false,
    batchNumber: `B${randomInt(1000, 9999)}`,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    quantityAvailable: quantity,
    price,
  });
  return item;
}

async function finalizedPrescriptionWithItem(doctorUserId: string, consultationId: string, productName = 'Paracetamol') {
  const created = await createPrescription(doctorUserId, consultationId, {
    doctorNotes: 'Take as directed',
    items: [{ productName, dosage: '500mg', frequency: 'Twice daily' }],
  });
  const finalized = await finalizePrescription(doctorUserId, created.id, { userId: doctorUserId });
  return finalized;
}

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  razorpayMock.isConfigured.mockReturnValue(true);
  razorpayMock.verifySignature.mockReturnValue(true);
});

describe('OTC medicine catalogue', () => {
  it('only shows OTC medicines from an approved, active pharmacy on the public catalogue', async () => {
    const { pharmacyUserId } = await approvedPharmacy();
    const otc = await stockedOtcMedicine(pharmacyUserId, `Ibuprofen-${randomInt(1000, 9999)}`);
    const rx = await addInventory(pharmacyUserId, {
      name: `PrescribedOnly-${randomInt(1000, 9999)}`,
      requiresPrescription: true,
      batchNumber: 'B1',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 10,
      price: 100,
    });

    const otcResult = await searchPublic({ q: otc.medicine.name });
    expect(otcResult.medicines.some((m) => m.medicineId === otc.medicineId)).toBe(true);

    const rxResult = await searchPublic({ q: rx.medicine.name });
    expect(rxResult.medicines.some((m) => m.medicineId === rx.medicineId)).toBe(false);
  });
});

describe('prescription resolves to the medicines catalogue', () => {
  it('finalizing a prescription resolves each item to a Medicine row', async () => {
    const { doctorUserId, consultationId } = await confirmedAppointment();
    const name = `Paracetamol-${randomInt(1000, 9999)}`;
    const finalized = await finalizedPrescriptionWithItem(doctorUserId, consultationId, name);

    expect(finalized.items[0]?.medicineId).toBeTruthy();
    const medicine = await prisma.medicine.findUniqueOrThrow({ where: { id: finalized.items[0]!.medicineId! } });
    expect(medicine.name).toBe(name);
  });

  it('matches a prescription item against a pharmacy that stocks it by name, case-insensitively', async () => {
    const { doctorUserId, consultationId } = await confirmedAppointment();
    const name = `Amoxicillin-${randomInt(1000, 9999)}`;
    const finalized = await finalizedPrescriptionWithItem(doctorUserId, consultationId, name);
    const patientId = finalized.patientUserId;

    const { pharmacyUserId: stockedPharmacyUserId, pharmacyId: stockedPharmacyId } = await approvedPharmacy();
    await addInventory(stockedPharmacyUserId, {
      name: name.toLowerCase(),
      requiresPrescription: true,
      batchNumber: 'B1',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 20,
      price: 80,
    });
    const { pharmacyId: emptyPharmacyId } = await approvedPharmacy();

    const stockedMatch = await matchPrescriptionAtPharmacy(patientId, finalized.id, stockedPharmacyId);
    expect(stockedMatch[0]?.available).toBe(true);
    expect(stockedMatch[0]?.quantityAvailable).toBe(20);

    const emptyMatch = await matchPrescriptionAtPharmacy(patientId, finalized.id, emptyPharmacyId);
    expect(emptyMatch[0]?.available).toBe(false);
  });
});

describe('booking a medicine order', () => {
  it('books an OTC item, pays, and reserves stock', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Vitamin-${randomInt(1000, 9999)}`, 10, 50);

    const { order, razorpayOrder } = await bookOrder(patientId, {
      pharmacyId,
      deliveryAddress: '221B Baker Street',
      items: [{ medicineId: stocked.medicineId, quantity: 3 }],
    });
    expect(order.status).toBe('PENDING');

    const afterBooking = await prisma.pharmacyInventory.findUniqueOrThrow({ where: { id: stocked.id } });
    expect(afterBooking.quantityAvailable).toBe(7);

    const confirmed = await verifyOrderPayment(
      patientId,
      { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );
    expect(confirmed.status).toBe('PENDING');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId! } });
    expect(payment.status).toBe('SUCCESS');
    expect(payment.amount).toBe(150);
  });

  it('refuses to order a prescription-required item without a matching prescription', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const rxItem = await addInventory(pharmacyUserId, {
      name: `RxOnly-${randomInt(1000, 9999)}`,
      requiresPrescription: true,
      batchNumber: 'B1',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 10,
      price: 100,
    });

    await expect(
      bookOrder(patientId, { pharmacyId, deliveryAddress: 'Somewhere', items: [{ medicineId: rxItem.medicineId, quantity: 1 }] }),
    ).rejects.toThrow(BadRequestError);
  });

  it('refuses to book more than is in stock', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Limited-${randomInt(1000, 9999)}`, 2, 20);

    await expect(
      bookOrder(patientId, { pharmacyId, deliveryAddress: 'Somewhere', items: [{ medicineId: stocked.medicineId, quantity: 5 }] }),
    ).rejects.toThrow(BadRequestError);
  });

  it('cancelling a pending order restocks the reserved quantity', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Restock-${randomInt(1000, 9999)}`, 10, 20);

    const { order } = await bookOrder(patientId, {
      pharmacyId,
      deliveryAddress: 'Somewhere',
      items: [{ medicineId: stocked.medicineId, quantity: 4 }],
    });
    let row = await prisma.pharmacyInventory.findUniqueOrThrow({ where: { id: stocked.id } });
    expect(row.quantityAvailable).toBe(6);

    await cancelOrder(patientId, 'PATIENT', order.id, {}, { userId: patientId });
    row = await prisma.pharmacyInventory.findUniqueOrThrow({ where: { id: stocked.id } });
    expect(row.quantityAvailable).toBe(10);
  });

  it("refuses a non-owning patient from cancelling someone else's order", async () => {
    const patientId = await registerUser('PATIENT');
    const stranger = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Guarded-${randomInt(1000, 9999)}`, 10, 20);

    const { order } = await bookOrder(patientId, {
      pharmacyId,
      deliveryAddress: 'Somewhere',
      items: [{ medicineId: stocked.medicineId, quantity: 1 }],
    });

    await expect(cancelOrder(stranger, 'PATIENT', order.id, {}, { userId: stranger })).rejects.toThrow(ForbiddenError);
  });
});

describe('pharmacy fulfilment', () => {
  async function paidOrder() {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Flow-${randomInt(1000, 9999)}`, 10, 40);
    const { order, razorpayOrder } = await bookOrder(patientId, {
      pharmacyId,
      deliveryAddress: 'Somewhere',
      items: [{ medicineId: stocked.medicineId, quantity: 2 }],
    });
    await verifyOrderPayment(
      patientId,
      { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );
    return { pharmacyUserId, patientId, orderId: order.id };
  }

  it('refuses to accept an order before payment has succeeded', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Unpaid-${randomInt(1000, 9999)}`, 10, 20);
    const { order } = await bookOrder(patientId, {
      pharmacyId,
      deliveryAddress: 'Somewhere',
      items: [{ medicineId: stocked.medicineId, quantity: 1 }],
    });

    await expect(acceptOrder(pharmacyUserId, order.id)).rejects.toThrow(ConflictError);
  });

  it('excludes unpaid orders from the pharmacy order list', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Excluded-${randomInt(1000, 9999)}`, 10, 20);
    await bookOrder(patientId, { pharmacyId, deliveryAddress: 'Somewhere', items: [{ medicineId: stocked.medicineId, quantity: 1 }] });

    const orders = await listMineAsPharmacy(pharmacyUserId);
    expect(orders).toHaveLength(0);
  });

  it('walks a paid order through accept, packing, dispatch, and delivery', async () => {
    const { pharmacyUserId, patientId, orderId } = await paidOrder();

    const accepted = await acceptOrder(pharmacyUserId, orderId);
    expect(accepted.status).toBe('ACCEPTED');

    const packing = await markPacking(pharmacyUserId, orderId);
    expect(packing.status).toBe('PACKING');

    const dispatched = await dispatchOrder(pharmacyUserId, orderId, { carrier: 'BlueDart', trackingRef: 'BD123' });
    expect(dispatched.status).toBe('DISPATCHED');

    const delivered = await markDelivered(pharmacyUserId, orderId);
    expect(delivered.status).toBe('DELIVERED');

    const order = await getOrder(patientId, 'PATIENT', orderId);
    expect(order.shipment?.deliveredAt).not.toBeNull();
    expect(order.shipment?.carrier).toBe('BlueDart');
  });

  it('refuses a pharmacy acting on an order it does not own', async () => {
    const { orderId } = await paidOrder();
    const { pharmacyUserId: otherPharmacyUserId } = await approvedPharmacy();
    await expect(acceptOrder(otherPharmacyUserId, orderId)).rejects.toThrow(NotFoundError);
  });
});
