import { listApprovedPharmacies } from '@/modules/medicines/pharmacies.service';
import { listFinalizedPrescriptionsForPatient, listMineAsPatient as listOrders } from '@/modules/medicines/orders.service';
import { listMine as listMyReviews } from '@/modules/reviews/reviews.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { MedicinesDashboard } from './dashboard';

export default async function PatientMedicinesPage() {
  const session = await requireSessionOrRedirect();
  const [prescriptions, orders, pharmacies, reviews] = await Promise.all([
    listFinalizedPrescriptionsForPatient(session.userId),
    listOrders(session.userId),
    listApprovedPharmacies(),
    listMyReviews(session.userId),
  ]);
  const reviewedMedicineOrderKeys = new Set(
    reviews.filter((r) => r.targetType === 'MEDICINE' && r.sourceType === 'MEDICINE_ORDER').map((r) => `${r.sourceId}:${r.targetId}`),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Medicines</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Order against a finalized prescription from a pharmacy of your choice, or browse the medicines catalogue
        for over-the-counter items.
      </p>

      <MedicinesDashboard
        prescriptions={prescriptions.map((p) => ({
          id: p.id,
          doctorName: [p.doctorProfile.title, p.doctorProfile.firstName, p.doctorProfile.lastName].filter(Boolean).join(' '),
          finalizedAt: p.finalizedAt?.toISOString() ?? null,
          items: p.items.map((item) => ({ id: item.id, productName: item.productName, dosage: item.dosage, frequency: item.frequency })),
        }))}
        pharmacies={pharmacies}
        initialOrders={orders.map((o) => ({
          id: o.id,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          pharmacyName: o.pharmacy.name,
          itemNames: o.items.map((i) => `${i.medicine.name} ×${i.quantity}`),
          items: o.items.map((i) => ({
            medicineId: i.medicineId,
            name: i.medicine.name,
            hasReview: reviewedMedicineOrderKeys.has(`${o.id}:${i.medicineId}`),
          })),
          shipment: o.shipment
            ? {
                carrier: o.shipment.carrier,
                trackingRef: o.shipment.trackingRef,
                dispatchedAt: o.shipment.dispatchedAt?.toISOString() ?? null,
                deliveredAt: o.shipment.deliveredAt?.toISOString() ?? null,
              }
            : null,
        }))}
      />
    </div>
  );
}
