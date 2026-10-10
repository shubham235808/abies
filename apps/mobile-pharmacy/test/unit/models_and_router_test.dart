import 'package:abies_pharmacy/core/router/app_router.dart';
import 'package:abies_pharmacy/features/auth/domain/auth_result.dart';
import 'package:abies_pharmacy/features/inventory/domain/inventory_item.dart';
import 'package:abies_pharmacy/features/orders/domain/pharmacy_order.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  group('PharmacyOrder.fromJson', () {
    test('parses the list shape (no shipment/payment)', () {
      final o = PharmacyOrder.fromJson(orderJson(id: 'o1', status: 'PENDING'));
      expect(o.status, OrderStatus.pending);
      expect(o.patientName, 'Asha Rao');
      expect(o.items.single.medicineName, 'Ashwagandha Churna');
      expect(o.total, 80);
      expect(o.shipment, isNull);
      expect(o.itemsSummary, 'Ashwagandha Churna ×2');
    });

    test('parses the detail shape including payment and shipment', () {
      final json = orderJson(id: 'o1', status: 'DISPATCHED', detail: true)
        ..['shipment'] = {'carrier': 'BlueDart', 'trackingRef': 'BD1', 'dispatchedAt': '2026-10-09T12:00:00.000Z', 'deliveredAt': null}
        ..['payment'] = {'status': 'SUCCESS', 'amount': 95};
      final o = PharmacyOrder.fromJson(json);
      expect(o.shipment?.carrier, 'BlueDart');
      expect(o.shipment?.dispatchedAt, isNotNull);
      expect(o.total, 95, reason: 'payment amount wins over the item sum when present');
      expect(o.items.single.form, 'Powder');
    });

    test('falls back to the mobile number when the patient has no profile name', () {
      final json = orderJson(id: 'o1', status: 'PENDING')..['patientUser'] = {'mobile': '+919000000001', 'patientProfile': null};
      expect(PharmacyOrder.fromJson(json).patientName, '+919000000001');
    });

    test('status helpers match the backend state machine', () {
      expect(OrderStatus.fromWire('PACKING'), OrderStatus.packing);
      expect(OrderStatus.fromWire('SOMETHING_NEW'), OrderStatus.unknown);
      expect(OrderStatus.pending.canCancel, isTrue);
      expect(OrderStatus.accepted.canCancel, isTrue);
      expect(OrderStatus.packing.canCancel, isFalse);
      expect(OrderStatus.delivered.isActive, isFalse);
    });
  });

  test('InventoryItem.fromJson reads medicine + variant includes', () {
    final json = inventoryJson(id: 'i1', hsn: null)..['variant'] = {'label': '250gm'};
    final item = InventoryItem.fromJson(json);
    expect(item.displayName, 'Triphala Tablets (250gm)');
    expect(item.hsnCode, isNull);
    expect(item.mrp, 150);
    expect(item.requiresPrescription, isFalse);
  });

  test('RequestOtpResult carries devOtp only when the backend sends it', () {
    final withDev = RequestOtpResult.fromJson({'requestId': 'r', 'expiresInSeconds': 300, 'isNewAccount': true, 'devOtp': '123456'});
    final without = RequestOtpResult.fromJson({'requestId': 'r', 'expiresInSeconds': 300, 'isNewAccount': false});
    expect(withDev.devOtp, '123456');
    expect(without.devOtp, isNull);
  });

  group('decideAuthRedirect', () {
    test('signed out: auth screens allowed, everything else goes to sign-in', () {
      expect(decideAuthRedirect(isSignedIn: false, onAuthFlowRoute: true), AuthRedirectDecision.allow);
      expect(decideAuthRedirect(isSignedIn: false, onAuthFlowRoute: false), AuthRedirectDecision.goSignIn);
    });

    test('signed in: auth screens bounce home, everything else allowed', () {
      expect(decideAuthRedirect(isSignedIn: true, onAuthFlowRoute: true), AuthRedirectDecision.goHome);
      expect(decideAuthRedirect(isSignedIn: true, onAuthFlowRoute: false), AuthRedirectDecision.allow);
    });

    test('apply, forgot-password and password-setup count as auth screens', () {
      for (final p in ['/sign-in', '/apply', '/forgot-password', '/password-setup']) {
        expect(isAuthFlowRoute(p), isTrue, reason: p);
      }
      for (final p in ['/', '/orders', '/orders/abc', '/inventory']) {
        expect(isAuthFlowRoute(p), isFalse, reason: p);
      }
    });
  });
}
