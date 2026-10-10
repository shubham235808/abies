import '../../../core/api/api_client.dart';
import '../domain/pharmacy_order.dart';

/// Pharmacy-side medicine-order endpoints — every one an existing route,
/// confirmed by reading it (apps/platform-api/src/app/api/v1/...):
///
/// - `GET  pharmacies/me/orders`                — `{orders}` (`listMineAsPharmacy`, paid only)
/// - `GET  medicine-orders/:id`                 — `{order}` (`getOrder`, PATIENT|PHARMACY)
/// - `POST pharmacies/me/orders/:id/accept`     — PENDING -> ACCEPTED (409 if unpaid)
/// - `POST pharmacies/me/orders/:id/packing`    — ACCEPTED -> PACKING
/// - `POST pharmacies/me/orders/:id/dispatch`   — PACKING -> DISPATCHED, body `dispatchOrderSchema` `{carrier?, trackingRef?}`
/// - `POST pharmacies/me/orders/:id/delivered`  — DISPATCHED -> DELIVERED
/// - `POST medicine-orders/:id/cancel`          — PENDING|ACCEPTED -> CANCELLED, body `cancelOrderSchema` `{reason?}`
///
/// The transition routes return the bare updated `MedicineOrder` row (no
/// `patientUser`/`items` include), so they only report the new status here;
/// callers re-fetch the detail for the full picture.
abstract class PharmacyOrdersApi {
  Future<List<PharmacyOrder>> listOrders();

  Future<PharmacyOrder> orderDetail(String orderId);

  Future<OrderStatus> accept(String orderId);

  Future<OrderStatus> startPacking(String orderId);

  Future<OrderStatus> dispatch(String orderId, {String? carrier, String? trackingRef});

  Future<OrderStatus> markDelivered(String orderId);

  Future<OrderStatus> cancel(String orderId, {String? reason});
}

class PharmacyOrdersApiImpl implements PharmacyOrdersApi {
  PharmacyOrdersApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<PharmacyOrder>> listOrders() {
    return _client.get<List<PharmacyOrder>>(
      '/api/v1/pharmacies/me/orders',
      decode: (json) => ((json as Map<String, dynamic>)['orders'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(PharmacyOrder.fromJson)
          .toList(),
    );
  }

  @override
  Future<PharmacyOrder> orderDetail(String orderId) {
    return _client.get<PharmacyOrder>(
      '/api/v1/medicine-orders/${Uri.encodeComponent(orderId)}',
      decode: (json) => PharmacyOrder.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  Future<OrderStatus> _transition(String path, [Map<String, dynamic> body = const {}]) {
    return _client.post<OrderStatus>(
      path,
      body: body,
      decode: (json) => OrderStatus.fromWire(((json as Map<String, dynamic>)['order'] as Map<String, dynamic>)['status'] as String?),
    );
  }

  String _orderPath(String orderId, String action) => '/api/v1/pharmacies/me/orders/${Uri.encodeComponent(orderId)}/$action';

  @override
  Future<OrderStatus> accept(String orderId) => _transition(_orderPath(orderId, 'accept'));

  @override
  Future<OrderStatus> startPacking(String orderId) => _transition(_orderPath(orderId, 'packing'));

  @override
  Future<OrderStatus> dispatch(String orderId, {String? carrier, String? trackingRef}) {
    return _transition(_orderPath(orderId, 'dispatch'), {
      if (carrier != null && carrier.trim().isNotEmpty) 'carrier': carrier.trim(),
      if (trackingRef != null && trackingRef.trim().isNotEmpty) 'trackingRef': trackingRef.trim(),
    });
  }

  @override
  Future<OrderStatus> markDelivered(String orderId) => _transition(_orderPath(orderId, 'delivered'));

  @override
  Future<OrderStatus> cancel(String orderId, {String? reason}) {
    return _transition('/api/v1/medicine-orders/${Uri.encodeComponent(orderId)}/cancel', {
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    });
  }
}
