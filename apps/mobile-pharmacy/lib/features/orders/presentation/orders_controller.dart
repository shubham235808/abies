import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/pharmacy_orders_api.dart';
import '../domain/pharmacy_order.dart';

final pharmacyOrdersApiProvider = Provider<PharmacyOrdersApi>((ref) => PharmacyOrdersApiImpl(ref.watch(apiClientProvider)));

/// Every paid order for this pharmacy (`GET /pharmacies/me/orders`), oldest
/// first — the backend's own `orderBy: createdAt asc`, i.e. a FIFO work
/// queue. Rebuilds whenever the session changes, and refuses to run signed
/// out (same guard as apps/mobile's `/mine`-shaped controllers).
class OrdersController extends AsyncNotifier<List<PharmacyOrder>> {
  @override
  Future<List<PharmacyOrder>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('OrdersController read before sign-in');
    return ref.watch(pharmacyOrdersApiProvider).listOrders();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<PharmacyOrder>>.loading().copyWithPrevious(state);
    state = await AsyncValue.guard(() => ref.read(pharmacyOrdersApiProvider).listOrders());
  }
}

final ordersControllerProvider = AsyncNotifierProvider<OrdersController, List<PharmacyOrder>>(OrdersController.new);

/// Dashboard buckets — the same split as the web pharmacy overview
/// (apps/partner-web/src/app/partner/pharmacy/page.tsx: "New orders", "To
/// pack", "Ready to dispatch", "In transit").
class OrderBuckets {
  OrderBuckets(List<PharmacyOrder> orders)
      : newOrders = orders.where((o) => o.status == OrderStatus.pending).toList(),
        toPack = orders.where((o) => o.status == OrderStatus.accepted).toList(),
        readyToDispatch = orders.where((o) => o.status == OrderStatus.packing).toList(),
        inTransit = orders.where((o) => o.status == OrderStatus.dispatched).toList(),
        active = orders.where((o) => o.status.isActive).toList();

  final List<PharmacyOrder> newOrders;
  final List<PharmacyOrder> toPack;
  final List<PharmacyOrder> readyToDispatch;
  final List<PharmacyOrder> inTransit;
  final List<PharmacyOrder> active;
}

/// One order's detail plus the fulfilment actions on it. Each action returns
/// null on success or the backend's own error message (e.g. "This order has
/// not been paid for yet", "Only an accepted order can move to packing") —
/// never a guessed one — and on success re-fetches the detail and
/// invalidates the list so the dashboard counts follow.
class OrderDetailController extends AutoDisposeFamilyAsyncNotifier<PharmacyOrder, String> {
  @override
  Future<PharmacyOrder> build(String orderId) async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('OrderDetailController read before sign-in');
    return ref.watch(pharmacyOrdersApiProvider).orderDetail(orderId);
  }

  PharmacyOrdersApi get _api => ref.read(pharmacyOrdersApiProvider);

  Future<String?> accept() => _run((api) => api.accept(arg));

  Future<String?> startPacking() => _run((api) => api.startPacking(arg));

  Future<String?> dispatch({String? carrier, String? trackingRef}) =>
      _run((api) => api.dispatch(arg, carrier: carrier, trackingRef: trackingRef));

  Future<String?> markDelivered() => _run((api) => api.markDelivered(arg));

  Future<String?> cancel({String? reason}) => _run((api) => api.cancel(arg, reason: reason));

  Future<String?> _run(Future<OrderStatus> Function(PharmacyOrdersApi api) action) async {
    final OrderStatus newStatus;
    try {
      newStatus = await action(_api);
    } on ApiException catch (e) {
      return e.message;
    }
    try {
      state = AsyncValue.data(await _api.orderDetail(arg));
    } on ApiException {
      // The transition itself succeeded; if only the follow-up read failed,
      // still reflect the new status rather than showing a stale one.
      final current = state.valueOrNull;
      if (current != null) state = AsyncValue.data(current.copyWith(status: newStatus));
    }
    ref.invalidate(ordersControllerProvider);
    return null;
  }
}

final orderDetailControllerProvider =
    AsyncNotifierProvider.autoDispose.family<OrderDetailController, PharmacyOrder, String>(OrderDetailController.new);
