import 'package:abies_mobile/features/pharmacy/domain/cart.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_facets.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_creation.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_detail.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_review.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_search_result.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_summary.dart';
import 'package:abies_mobile/features/pharmacy/domain/pharmacy_summary.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('MedicineSummary.fromJson', () {
    test('parses the real searchPublic() PublicMedicineListing shape, including variants', () {
      final medicine = MedicineSummary.fromJson({
        'medicineId': 'm1',
        'name': 'Paracetamol',
        'genericName': 'Acetaminophen',
        'form': 'Tablet',
        'strength': '500mg',
        'brandName': 'Crocin',
        'imageUrl': null,
        'pharmacy': {'id': 'ph1', 'name': 'City Pharmacy', 'serviceAreas': ['Pune']},
        'quantityAvailable': 40,
        'price': 20,
        'rating': 4.2,
        'reviewCount': 5,
        'isFmcg': false,
        'variants': [
          {'variantId': 'v1', 'label': 'Strip of 10', 'price': 20, 'quantityAvailable': 40},
        ],
      });

      expect(medicine.medicineId, 'm1');
      expect(medicine.pharmacyId, 'ph1');
      expect(medicine.pharmacyName, 'City Pharmacy');
      expect(medicine.pharmacyServiceAreas, ['Pune']);
      expect(medicine.hasVariants, isTrue);
      expect(medicine.variants.single.label, 'Strip of 10');
    });

    test('a plain non-variant product has one variant row with variantId null', () {
      final medicine = MedicineSummary.fromJson({
        'medicineId': 'm2',
        'name': 'ORS',
        'genericName': null,
        'form': null,
        'strength': null,
        'brandName': null,
        'imageUrl': null,
        'pharmacy': {'id': 'ph1', 'name': 'City Pharmacy', 'serviceAreas': []},
        'quantityAvailable': 10,
        'price': 15,
        'rating': 0,
        'reviewCount': 0,
        'isFmcg': false,
        'variants': [
          {'variantId': null, 'label': null, 'price': 15, 'quantityAvailable': 10},
        ],
      });

      expect(medicine.hasVariants, isFalse);
    });
  });

  test('MedicineSearchResult.fromJson parses total/medicines', () {
    final result = MedicineSearchResult.fromJson({'total': 1, 'medicines': []});
    expect(result.total, 1);
    expect(result.medicines, isEmpty);
  });

  test('MedicineFacets.fromJson parses areas/categories/brands', () {
    final facets = MedicineFacets.fromJson({'areas': ['Pune'], 'categories': ['Pain relief'], 'brands': ['Crocin']});
    expect(facets.areas, ['Pune']);
    expect(facets.categories, ['Pain relief']);
    expect(facets.brands, ['Crocin']);
  });

  test('MedicineReview.fromJson joins the author patientProfile name', () {
    final review = MedicineReview.fromJson({
      'id': 'r1',
      'rating': 5,
      'comment': 'Great',
      'createdAt': '2026-01-01T00:00:00.000Z',
      'author': {'patientProfile': {'firstName': 'Asha', 'lastName': 'Rao'}},
    });
    expect(review.authorName, 'Asha Rao');
  });

  test('PharmacySummary.fromJson parses listApprovedPharmacies() shape', () {
    final pharmacy = PharmacySummary.fromJson({'id': 'ph1', 'name': 'City Pharmacy', 'serviceAreas': ['Pune', 'Mumbai']});
    expect(pharmacy.id, 'ph1');
    expect(pharmacy.serviceAreas, ['Pune', 'Mumbai']);
  });

  group('Cart/CartItem.fromJson', () {
    test('parses getCart()/listMyCarts() shape, including a live-unavailable item', () {
      final cart = Cart.fromJson({
        'id': 'c1',
        'pharmacy': {'id': 'ph1', 'name': 'City Pharmacy'},
        'status': 'ACTIVE',
        'items': [
          {
            'id': 'ci1',
            'medicineId': 'm1',
            'medicineName': 'Paracetamol',
            'imageUrl': null,
            'variantId': null,
            'variantLabel': null,
            'quantity': 2,
            'unitPrice': 20,
            'available': true,
          },
          {
            'id': 'ci2',
            'medicineId': 'm2',
            'medicineName': 'ORS',
            'imageUrl': null,
            'variantId': null,
            'variantLabel': null,
            'quantity': 5,
            'unitPrice': null,
            'available': false,
          },
        ],
        'subtotal': 40,
      });

      expect(cart.pharmacyId, 'ph1');
      expect(cart.items.length, 2);
      expect(cart.items.first.lineTotal, 40);
      expect(cart.hasUnavailableItems, isTrue);
      expect(cart.subtotal, 40);
    });
  });

  group('MedicineOrderDetail.fromJson', () {
    test('full detail shape (getOrder()) parses items/shipment/payment', () {
      final order = MedicineOrderDetail.fromJson({
        'id': 'o1',
        'status': 'DISPATCHED',
        'pharmacyId': 'ph1',
        'pharmacy': {'id': 'ph1', 'name': 'City Pharmacy', 'serviceAreas': []},
        'prescriptionId': null,
        'deliveryAddress': '221B Baker Street',
        'createdAt': '2026-01-01T00:00:00.000Z',
        'cancelledAt': null,
        'cancellationReason': null,
        'items': [
          {
            'medicineId': 'm1',
            'medicine': {'name': 'Paracetamol', 'form': 'Tablet', 'strength': '500mg'},
            'variantId': null,
            'variant': null,
            'batchNumber': 'B1',
            'quantity': 2,
            'unitPrice': 20,
            'prescriptionItemId': null,
          },
        ],
        'shipment': {'carrier': 'Speed Post', 'trackingRef': 'SP123', 'dispatchedAt': '2026-01-02T00:00:00.000Z', 'deliveredAt': null},
        'payment': {'status': 'SUCCESS', 'amount': 40},
      });

      expect(order.pharmacyName, 'City Pharmacy');
      expect(order.items.single.medicineName, 'Paracetamol');
      expect(order.items.single.lineTotal, 40);
      expect(order.carrier, 'Speed Post');
      expect(order.paymentStatus, 'SUCCESS');
      expect(order.canCancel, isFalse);
      expect(order.canReview, isFalse);
      expect(order.isActive, isTrue);
    });

    test("cancel()'s/verify-payment()'s thin, un-included response still parses (null-safe)", () {
      final order = MedicineOrderDetail.fromJson({
        'id': 'o1',
        'status': 'CANCELLED',
        'pharmacyId': 'ph1',
        'prescriptionId': null,
        'deliveryAddress': null,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'cancelledAt': '2026-01-02T00:00:00.000Z',
        'cancellationReason': 'Change of plan',
        'items': [],
      });

      expect(order.pharmacyName, isNull);
      expect(order.items, isEmpty);
      expect(order.paymentStatus, isNull);
      expect(order.canCancel, isFalse);
    });

    test('DELIVERED status makes canReview true and PENDING makes canCancel true', () {
      final pending = MedicineOrderDetail.fromJson({
        'id': 'o1',
        'status': 'PENDING',
        'pharmacyId': 'ph1',
        'prescriptionId': null,
        'deliveryAddress': null,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'cancelledAt': null,
        'cancellationReason': null,
        'items': [],
      });
      expect(pending.canCancel, isTrue);

      final delivered = MedicineOrderDetail.fromJson({
        'id': 'o2',
        'status': 'DELIVERED',
        'pharmacyId': 'ph1',
        'prescriptionId': null,
        'deliveryAddress': null,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'cancelledAt': null,
        'cancellationReason': null,
        'items': [],
      });
      expect(delivered.canReview, isTrue);
      expect(delivered.isActive, isFalse);
    });
  });

  test('MedicineOrderCreationResult.fromJson parses the raw bookOrder()/checkoutCart() shape', () {
    final result = MedicineOrderCreationResult.fromJson({
      'order': {'id': 'o1', 'status': 'PENDING'},
      'payment': {'amount': 100, 'currency': 'INR'},
      'razorpayOrder': {'id': 'order_1'},
      'razorpayKeyId': 'rzp_test',
    });
    expect(result.orderId, 'o1');
    expect(result.amount, 100);
    expect(result.razorpayOrderId, 'order_1');
  });
}
