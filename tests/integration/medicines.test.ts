// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@abies/domain/lib/errors';
import { requestOtp, verifyOtp } from '@abies/domain/modules/auth/auth.service';
import { approve as approveDoctor, reviewDocument } from '@abies/domain/modules/doctors/admin-doctors.service';
import { addAvailability, addDocument, submit as submitDoctor, updateMe } from '@abies/domain/modules/doctors/doctors.service';

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
vi.mock('@abies/domain/lib/payments/razorpay', () => razorpayMock);

import { holdSlot, verifyPayment } from '@abies/domain/modules/appointments/appointments.service';
import { createPrescription, finalizePrescription } from '@abies/domain/modules/consultations/prescriptions.service';
import { approve as approvePharmacy } from '@abies/domain/modules/medicines/admin-pharmacies.service';
import { addInventory, searchPublic, updateInventory } from '@abies/domain/modules/medicines/catalogue.service';
import { addToCart, checkoutCart, getCart, listMyCarts, removeCartItem, updateCartItem } from '@abies/domain/modules/medicines/cart.service';
import { createGstRate } from '@abies/domain/modules/configuration/configuration.service';
import { ensurePharmacyProfile, submitPharmacy, updateMyPharmacy, upsertMyTaxSettings } from '@abies/domain/modules/medicines/pharmacies.service';
import { recordSale } from '@abies/domain/modules/medicines/pos.service';
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
} from '@abies/domain/modules/medicines/orders.service';

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
const createdGstRateIds: string[] = [];

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
  // GstRateConfig is global (no FK to a pharmacy), so it doesn't cascade
  // away with the test users above — clean it up explicitly.
  if (createdGstRateIds.length) {
    await prisma.gstRateConfig.deleteMany({ where: { id: { in: createdGstRateIds } } });
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

describe('FMCG catalogue (EXPANSION-3)', () => {
  it('flags a medicine as FMCG when the pharmacist sets it, and leaves it false by default', async () => {
    const { pharmacyUserId } = await approvedPharmacy();
    const fmcgItem = await addInventory(pharmacyUserId, {
      name: `HandWash-${randomInt(1000, 9999)}`,
      requiresPrescription: false,
      isFmcg: true,
      batchNumber: `B${randomInt(1000, 9999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 20,
      price: 99,
    });
    expect(fmcgItem.medicine.isFmcg).toBe(true);

    const ayurvedaItem = await stockedOtcMedicine(pharmacyUserId, `Triphala-${randomInt(1000, 9999)}`);
    expect(ayurvedaItem.medicine.isFmcg).toBe(false);
  });

  it('searchPublic filters by isFmcg when asked, and stays unfiltered (both catalogues) when not', async () => {
    const { pharmacyUserId } = await approvedPharmacy();
    const sharedTag = `FmcgSearch-${randomInt(100000, 999999)}`;
    const fmcgItem = await addInventory(pharmacyUserId, {
      name: `${sharedTag}-Soap`,
      requiresPrescription: false,
      isFmcg: true,
      batchNumber: `B${randomInt(1000, 9999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 20,
      price: 60,
    });
    const ayurvedaItem = await addInventory(pharmacyUserId, {
      name: `${sharedTag}-Churna`,
      requiresPrescription: false,
      batchNumber: `B${randomInt(1000, 9999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 20,
      price: 60,
    });

    const fmcgOnly = await searchPublic({ q: sharedTag, isFmcg: true });
    expect(fmcgOnly.medicines.map((m) => m.medicineId)).toEqual([fmcgItem.medicineId]);

    const ayurvedaOnly = await searchPublic({ q: sharedTag, isFmcg: false });
    expect(ayurvedaOnly.medicines.map((m) => m.medicineId)).toEqual([ayurvedaItem.medicineId]);

    const both = await searchPublic({ q: sharedTag });
    expect(both.medicines.map((m) => m.medicineId).sort()).toEqual([fmcgItem.medicineId, ayurvedaItem.medicineId].sort());
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

describe('stock movement ledger (ENTERPRISE-7)', () => {
  it('records a PURCHASE movement when a batch is first added', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Ledger-${randomInt(1000, 9999)}`, 40, 25);

    const movements = await prisma.stockMovement.findMany({ where: { pharmacyId, inventoryId: stocked.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe('PURCHASE');
    expect(movements[0]?.quantityDelta).toBe(40);
  });

  it('records a MANUAL_CORRECTION movement only when the quantity actually changes', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Correction-${randomInt(1000, 9999)}`, 20, 25);

    await updateInventory(pharmacyUserId, stocked.id, { price: 30 });
    let movements = await prisma.stockMovement.findMany({ where: { pharmacyId, inventoryId: stocked.id } });
    expect(movements).toHaveLength(1); // just the initial PURCHASE — price-only edit isn't a stock change

    await updateInventory(pharmacyUserId, stocked.id, { quantityAvailable: 15 });
    movements = await prisma.stockMovement.findMany({ where: { pharmacyId, inventoryId: stocked.id }, orderBy: { createdAt: 'asc' } });
    expect(movements).toHaveLength(2);
    expect(movements[1]?.type).toBe('MANUAL_CORRECTION');
    expect(movements[1]?.quantityDelta).toBe(-5);
  });

  it('records ONLINE_ORDER on booking and RETURN on cancellation, both referencing the order', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Online-${randomInt(1000, 9999)}`, 10, 20);

    const { order } = await bookOrder(patientId, {
      pharmacyId,
      deliveryAddress: 'Somewhere',
      items: [{ medicineId: stocked.medicineId, quantity: 3 }],
    });
    let movements = await prisma.stockMovement.findMany({ where: { pharmacyId, inventoryId: stocked.id }, orderBy: { createdAt: 'asc' } });
    expect(movements[1]?.type).toBe('ONLINE_ORDER');
    expect(movements[1]?.quantityDelta).toBe(-3);
    expect(movements[1]?.referenceId).toBe(order.id);

    await cancelOrder(patientId, 'PATIENT', order.id, {}, { userId: patientId });
    movements = await prisma.stockMovement.findMany({ where: { pharmacyId, inventoryId: stocked.id }, orderBy: { createdAt: 'asc' } });
    expect(movements[2]?.type).toBe('RETURN');
    expect(movements[2]?.quantityDelta).toBe(3);
    expect(movements[2]?.referenceId).toBe(order.id);
  });
});

describe('POS / GST (ENTERPRISE-7)', () => {
  async function pharmacyWithGstReadyItem(ratePercent = 12, quantity = 50, price = 100) {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const hsnCode = `HSN${randomInt(100000, 999999)}`;
    const gstRate = await createGstRate({ hsnCode, label: 'Test category', ratePercent }, {});
    createdGstRateIds.push(gstRate.id);
    const item = await addInventory(pharmacyUserId, {
      name: `PosItem-${randomInt(1000, 9999)}`,
      requiresPrescription: false,
      category: 'Test',
      hsnCode,
      batchNumber: `POS${randomInt(1000, 9999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: quantity,
      price,
    });
    await upsertMyTaxSettings(
      pharmacyUserId,
      { legalBusinessName: 'Test Pharmacy LLP', gstin: '27AAAAA0000A1Z5', registeredState: 'Maharashtra', stateCode: '27', invoicePrefix: `TP${randomInt(100, 999)}` },
      {},
    );
    return { pharmacyUserId, pharmacyId, item, hsnCode };
  }

  it('records a sale with the correct CGST/SGST split and decrements stock', async () => {
    const { pharmacyUserId, pharmacyId, item } = await pharmacyWithGstReadyItem(12, 50, 100);

    const sale = await recordSale(
      pharmacyUserId,
      { paymentMethod: 'CASH', discountAmount: 0, items: [{ medicineId: item.medicineId, batchNumber: item.batchNumber, quantity: 5 }] },
      {},
    );

    expect(sale.subtotal).toBe(500); // 5 * 100
    expect(sale.taxAmount).toBe(60); // 12% of 500
    expect(sale.totalAmount).toBe(560);
    expect(sale.invoice?.cgst).toBe(30);
    expect(sale.invoice?.sgst).toBe(30);
    expect(sale.invoice?.igst).toBe(0);
    expect(sale.invoice?.invoiceNumber).toMatch(/^TP\d{3}-\d{6}$/);

    const row = await prisma.pharmacyInventory.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.quantityAvailable).toBe(45);

    const movement = await prisma.stockMovement.findFirst({ where: { pharmacyId, inventoryId: item.id, type: 'SALE' } });
    expect(movement?.quantityDelta).toBe(-5);
    expect(movement?.referenceType).toBe('PhysicalSale');
  });

  it('refuses a sale when the pharmacy has no tax settings configured', async () => {
    const { pharmacyUserId } = await approvedPharmacy();
    const hsnCode = `HSN${randomInt(100000, 999999)}`;
    const gstRate = await createGstRate({ hsnCode, label: 'Test category', ratePercent: 5 }, {});
    createdGstRateIds.push(gstRate.id);
    const item = await addInventory(pharmacyUserId, {
      name: `NoTax-${randomInt(1000, 9999)}`,
      requiresPrescription: false,
      hsnCode,
      batchNumber: `NT${randomInt(1000, 9999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 10,
      price: 50,
    });

    await expect(
      recordSale(pharmacyUserId, { paymentMethod: 'CASH', discountAmount: 0, items: [{ medicineId: item.medicineId, batchNumber: item.batchNumber, quantity: 1 }] }, {}),
    ).rejects.toThrow(BadRequestError);
  });

  it('refuses a sale for a medicine with no HSN code', async () => {
    const { pharmacyUserId } = await approvedPharmacy();
    await upsertMyTaxSettings(
      pharmacyUserId,
      { legalBusinessName: 'Test Pharmacy LLP', gstin: '27AAAAA0000A1Z5', registeredState: 'Maharashtra', stateCode: '27', invoicePrefix: `TP${randomInt(100, 999)}` },
      {},
    );
    const item = await stockedOtcMedicine(pharmacyUserId, `NoHsn-${randomInt(1000, 9999)}`, 10, 50);

    await expect(
      recordSale(pharmacyUserId, { paymentMethod: 'CASH', discountAmount: 0, items: [{ medicineId: item.medicineId, batchNumber: item.batchNumber, quantity: 1 }] }, {}),
    ).rejects.toThrow(BadRequestError);
  });
});

describe('medicine variants (EXPANSION-1)', () => {
  it('groups batches of the same pack size into one variant, and keeps different sizes separate', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const medicineName = `Chyawanprash-${randomInt(1000, 9999)}`;

    const small = await addInventory(pharmacyUserId, {
      name: medicineName,
      requiresPrescription: false,
      variantLabel: '250gm',
      batchNumber: `B${randomInt(100000, 999999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 20,
      price: 250,
    });
    expect(small.variant?.label).toBe('250gm');

    const large = await addInventory(pharmacyUserId, {
      medicineId: small.medicineId,
      variantLabel: '1kg',
      batchNumber: `B${randomInt(100000, 999999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 10,
      price: 800,
    });
    expect(large.variant?.label).toBe('1kg');
    expect(large.variant?.id).not.toBe(small.variant?.id);

    // A second batch of the SAME size finds the existing variant rather
    // than creating a duplicate.
    const secondSmallBatch = await addInventory(pharmacyUserId, {
      medicineId: small.medicineId,
      variantLabel: '250gm',
      batchNumber: `B${randomInt(100000, 999999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 5,
      price: 260,
    });
    expect(secondSmallBatch.variant?.id).toBe(small.variant?.id);

    const { medicines } = await searchPublic({ q: medicineName });
    const listing = medicines.find((m) => m.medicineId === small.medicineId && m.pharmacy.id === pharmacyId);
    expect(listing?.variants).toHaveLength(2);
    const sizes = listing?.variants.map((v) => v.label).sort();
    expect(sizes).toEqual(['1kg', '250gm']);
    const smallListing = listing?.variants.find((v) => v.label === '250gm');
    expect(smallListing?.quantityAvailable).toBe(25); // 20 + 5 across the two 250gm batches
    expect(smallListing?.price).toBe(250); // cheapest of the two 250gm batches
  });

  it("bookOrder matches the patient's chosen variant, never a different pack size", async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const medicineName = `Ashwagandha-${randomInt(1000, 9999)}`;

    const small = await addInventory(pharmacyUserId, {
      name: medicineName,
      requiresPrescription: false,
      variantLabel: '250gm',
      batchNumber: `V${randomInt(100000, 999999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 5,
      price: 300,
    });
    const large = await addInventory(pharmacyUserId, {
      medicineId: small.medicineId,
      variantLabel: '1kg',
      batchNumber: `V${randomInt(100000, 999999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 5,
      price: 900,
    });

    const { order } = await bookOrder(patientId, {
      pharmacyId,
      deliveryAddress: 'Somewhere',
      items: [{ medicineId: small.medicineId, variantId: large.variant!.id, quantity: 1 }],
    });

    const detail = await getOrder(patientId, 'PATIENT', order.id);
    expect(detail.items[0]?.unitPrice).toBe(900); // the 1kg variant's price, not the 250gm one
    expect(detail.items[0]?.variant?.label).toBe('1kg');

    const smallRow = await prisma.pharmacyInventory.findUniqueOrThrow({ where: { id: small.id } });
    const largeRow = await prisma.pharmacyInventory.findUniqueOrThrow({ where: { id: large.id } });
    expect(smallRow.quantityAvailable).toBe(5); // untouched
    expect(largeRow.quantityAvailable).toBe(4); // decremented
  });
});

describe('persistent cart (EXPANSION-1b)', () => {
  it('adding the same item twice accumulates quantity in one cart', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Cart-${randomInt(1000, 9999)}`, 20, 40);

    const first = await addToCart(patientId, { pharmacyId, medicineId: stocked.medicineId, quantity: 2 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.quantity).toBe(2);

    const second = await addToCart(patientId, { pharmacyId, medicineId: stocked.medicineId, quantity: 3 });
    expect(second.id).toBe(first.id);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.quantity).toBe(5);
    expect(second.subtotal).toBe(200); // 5 x 40
  });

  it('keeps carts from different pharmacies separate', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId: pharmacyUserId1, pharmacyId: pharmacyId1 } = await approvedPharmacy();
    const { pharmacyUserId: pharmacyUserId2, pharmacyId: pharmacyId2 } = await approvedPharmacy();
    const item1 = await stockedOtcMedicine(pharmacyUserId1, `Cart-${randomInt(1000, 9999)}`, 20, 40);
    const item2 = await stockedOtcMedicine(pharmacyUserId2, `Cart-${randomInt(1000, 9999)}`, 20, 60);

    await addToCart(patientId, { pharmacyId: pharmacyId1, medicineId: item1.medicineId, quantity: 1 });
    await addToCart(patientId, { pharmacyId: pharmacyId2, medicineId: item2.medicineId, quantity: 1 });

    const carts = await listMyCarts(patientId);
    expect(carts).toHaveLength(2);
    expect(new Set(carts.map((c) => c.pharmacy.id))).toEqual(new Set([pharmacyId1, pharmacyId2]));
  });

  it('refuses to add a prescription-required medicine to the cart', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const rxItem = await addInventory(pharmacyUserId, {
      name: `RxCart-${randomInt(1000, 9999)}`,
      requiresPrescription: true,
      batchNumber: 'B1',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 10,
      price: 100,
    });

    await expect(addToCart(patientId, { pharmacyId, medicineId: rxItem.medicineId, quantity: 1 })).rejects.toThrow(BadRequestError);
  });

  it('updating a cart item quantity to zero removes it', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Cart-${randomInt(1000, 9999)}`, 20, 40);

    const cart = await addToCart(patientId, { pharmacyId, medicineId: stocked.medicineId, quantity: 2 });
    const updated = await updateCartItem(patientId, cart.items[0]!.id, { quantity: 0 });
    expect(updated.items).toHaveLength(0);
  });

  it("refuses a non-owning patient from touching someone else's cart item", async () => {
    const patientId = await registerUser('PATIENT');
    const stranger = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Cart-${randomInt(1000, 9999)}`, 20, 40);

    const cart = await addToCart(patientId, { pharmacyId, medicineId: stocked.medicineId, quantity: 1 });
    await expect(removeCartItem(stranger, cart.items[0]!.id)).rejects.toThrow(NotFoundError);
  });

  it('checkout converts a cart into a real order and marks the cart CONVERTED', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Cart-${randomInt(1000, 9999)}`, 20, 40);

    const cart = await addToCart(patientId, { pharmacyId, medicineId: stocked.medicineId, quantity: 2 });
    const { order } = await checkoutCart(patientId, cart.id, { deliveryAddress: '221B Baker Street' });
    expect(order.status).toBe('PENDING');

    const row = await prisma.pharmacyInventory.findUniqueOrThrow({ where: { id: stocked.id } });
    expect(row.quantityAvailable).toBe(18);

    const convertedCart = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(convertedCart.status).toBe('CONVERTED');
    expect(convertedCart.convertedOrderId).toBe(order.id);

    await expect(getCart(patientId, cart.id)).resolves.toMatchObject({ status: 'CONVERTED' });
    const activeCarts = await listMyCarts(patientId);
    expect(activeCarts.find((c) => c.id === cart.id)).toBeUndefined();
  });

  it('refuses to check out an empty cart', async () => {
    const patientId = await registerUser('PATIENT');
    const { pharmacyId } = await approvedPharmacy();
    const cart = await prisma.cart.create({ data: { patientUserId: patientId, pharmacyId, status: 'ACTIVE' } });

    await expect(checkoutCart(patientId, cart.id, { deliveryAddress: 'Somewhere' })).rejects.toThrow(BadRequestError);
  });
});
