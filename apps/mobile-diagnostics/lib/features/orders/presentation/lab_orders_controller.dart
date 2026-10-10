import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../../shared/util/formatting.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/lab_orders_api.dart';
import '../domain/lab_order.dart';

final labOrdersApiProvider = Provider<LabOrdersApi>((ref) => LabOrdersApiImpl(ref.watch(apiClientProvider)));

/// Dashboard filter. "Active" is the default: what still needs the lab's
/// hands (scheduled → collected → processing).
enum OrderFilter { active, completed, all }

/// Counts the web lab overview (apps/partner-web/src/app/partner/lab/page.tsx)
/// derives from the same `listMineAsLab` response — no extra endpoint.
class LabOrderBuckets {
  LabOrderBuckets(List<LabOrderSummary> orders, {DateTime? now}) {
    final today = now ?? DateTime.now();
    toCollect = orders.where((o) => o.status == LabOrderStatus.scheduled).length;
    todaysCollections = orders
        .where((o) => o.status == LabOrderStatus.scheduled && o.scheduledAt != null && isSameLocalDay(o.scheduledAt!, today))
        .length;
    overdueCollections = orders
        .where((o) => o.status == LabOrderStatus.scheduled && o.scheduledAt != null && o.scheduledAt!.isBefore(today))
        .length;
    awaitingProcessing = orders.where((o) => o.status == LabOrderStatus.sampleCollected).length;
    processing = orders.where((o) => o.status == LabOrderStatus.processing).length;
    criticalUnacknowledged = orders.where((o) => o.isUnacknowledgedCritical).length;
  }

  late final int toCollect;
  late final int todaysCollections;
  late final int overdueCollections;
  late final int awaitingProcessing;
  late final int processing;
  late final int criticalUnacknowledged;
}

List<LabOrderSummary> filterOrders(List<LabOrderSummary> orders, OrderFilter filter) {
  switch (filter) {
    case OrderFilter.active:
      return orders.where((o) => o.status.isActive).toList();
    case OrderFilter.completed:
      return orders.where((o) => o.status == LabOrderStatus.completed).toList();
    case OrderFilter.all:
      return orders;
  }
}

/// `GET /api/v1/labs/me/orders`. Invalidated by [LabOrderDetailController]
/// after every status transition so the dashboard never shows a stale stage.
class LabOrdersController extends AsyncNotifier<List<LabOrderSummary>> {
  @override
  Future<List<LabOrderSummary>> build() {
    ref.watch(sessionUserIdProvider);
    return ref.watch(labOrdersApiProvider).listOrders();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<LabOrderSummary>>.loading().copyWithPrevious(state);
    state = await AsyncValue.guard(() => ref.read(labOrdersApiProvider).listOrders());
  }
}

final labOrdersControllerProvider = AsyncNotifierProvider<LabOrdersController, List<LabOrderSummary>>(LabOrdersController.new);

final orderFilterProvider = StateProvider<OrderFilter>((ref) => OrderFilter.active);

/// One order's detail plus its fulfilment actions. Each action calls the
/// real transition route, then re-reads `GET /diagnostic-orders/:id` rather
/// than patching local state — the transition routes return the bare order
/// row (no sampleCollection/report), and the server is the source of truth
/// for what stage the order is in. Each action returns null on success or a
/// user-facing error message (e.g. the server's own "Only a scheduled order
/// can have its sample collected" when another device got there first).
class LabOrderDetailController extends FamilyAsyncNotifier<LabOrderDetail, String> {
  @override
  Future<LabOrderDetail> build(String orderId) {
    ref.watch(sessionUserIdProvider);
    return ref.watch(labOrdersApiProvider).getOrder(orderId);
  }

  Future<String?> markSampleCollected({String? collectorName, String? sampleBarcode, String? qualityException}) {
    return _transition(
      () => ref.read(labOrdersApiProvider).markSampleCollected(
            arg,
            collectorName: collectorName,
            sampleBarcode: sampleBarcode,
            qualityException: qualityException,
          ),
    );
  }

  Future<String?> startProcessing() => _transition(() => ref.read(labOrdersApiProvider).markProcessing(arg));

  Future<String?> releaseReport({required bool criticalFlag, ReportUpload? file}) {
    return _transition(() => ref.read(labOrdersApiProvider).releaseReport(arg, criticalFlag: criticalFlag, file: file));
  }

  Future<String?> reload() async {
    try {
      state = AsyncValue.data(await ref.read(labOrdersApiProvider).getOrder(arg));
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> _transition(Future<void> Function() action) async {
    String? error;
    try {
      await action();
    } on ApiException catch (e) {
      error = e.message;
    }
    // Re-read even on failure: a 400 "Only a ... order can ..." means the
    // order already moved on server-side, and the screen should show where.
    final reloadError = await reload();
    ref.invalidate(labOrdersControllerProvider);
    return error ?? reloadError;
  }
}

final labOrderDetailControllerProvider =
    AsyncNotifierProvider.family<LabOrderDetailController, LabOrderDetail, String>(LabOrderDetailController.new);
