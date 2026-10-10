import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
import 'package:abies_pharmacy/features/orders/domain/pharmacy_order.dart';
import 'package:abies_pharmacy/features/orders/presentation/orders_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

PharmacyOrder _order(String id, String status, {bool detail = false}) =>
    PharmacyOrder.fromJson(orderJson(id: id, status: status, detail: detail));

ProviderContainer _container(FakeOrdersApi api, {FakeAuthApi? auth}) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(auth ?? (FakeAuthApi()..meResult = pharmacyUser)),
    pharmacyOrdersApiProvider.overrideWithValue(api),
  ]);
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('OrdersController', () {
    test('loads every paid order once signed in', () async {
      final api = FakeOrdersApi()..orders = [_order('o1', 'PENDING'), _order('o2', 'DELIVERED')];
      final list = await _container(api).read(ordersControllerProvider.future);
      expect(list.map((o) => o.id), ['o1', 'o2']);
    });

    test('refuses to load signed out', () async {
      final container = _container(FakeOrdersApi(), auth: FakeAuthApi());
      await expectLater(container.read(ordersControllerProvider.future), throwsA(isA<StateError>()));
    });

    test('OrderBuckets splits active orders the way the web dashboard does', () {
      final buckets = OrderBuckets([
        _order('a', 'PENDING'),
        _order('b', 'ACCEPTED'),
        _order('c', 'PACKING'),
        _order('d', 'DISPATCHED'),
        _order('e', 'DELIVERED'),
        _order('f', 'CANCELLED'),
        _order('g', 'PENDING'),
      ]);
      expect(buckets.newOrders.map((o) => o.id), ['a', 'g']);
      expect(buckets.toPack.map((o) => o.id), ['b']);
      expect(buckets.readyToDispatch.map((o) => o.id), ['c']);
      expect(buckets.inTransit.map((o) => o.id), ['d']);
      expect(buckets.active.map((o) => o.id), ['a', 'b', 'c', 'd', 'g']);
    });
  });

  group('OrderDetailController fulfilment', () {
    Future<(ProviderContainer, FakeOrdersApi)> setUpOrder(String status) async {
      final api = FakeOrdersApi()
        ..orders = [_order('o1', status)]
        ..details = {'o1': _order('o1', status, detail: true)};
      final container = _container(api);
      container.listen(orderDetailControllerProvider('o1'), (_, __) {});
      container.listen(ordersControllerProvider, (_, __) {});
      await container.read(ordersControllerProvider.future);
      await container.read(orderDetailControllerProvider('o1').future);
      return (container, api);
    }

    test('walks a paid order through accept -> packing -> dispatch -> delivered', () async {
      final (container, api) = await setUpOrder('PENDING');
      final notifier = container.read(orderDetailControllerProvider('o1').notifier);

      expect(await notifier.accept(), isNull);
      expect(container.read(orderDetailControllerProvider('o1')).value?.status, OrderStatus.accepted);

      expect(await notifier.startPacking(), isNull);
      expect(container.read(orderDetailControllerProvider('o1')).value?.status, OrderStatus.packing);

      expect(await notifier.dispatch(carrier: 'BlueDart', trackingRef: 'BD123'), isNull);
      expect(api.lastDispatch, {'carrier': 'BlueDart', 'trackingRef': 'BD123'});
      expect(container.read(orderDetailControllerProvider('o1')).value?.status, OrderStatus.dispatched);

      expect(await notifier.markDelivered(), isNull);
      expect(container.read(orderDetailControllerProvider('o1')).value?.status, OrderStatus.delivered);

      expect(api.calls, ['accept:o1', 'packing:o1', 'dispatch:o1', 'delivered:o1']);
      expect(api.detailCalls, 5, reason: 'initial load + one re-fetch after each of the four transitions');
    });

    test('each successful transition refreshes the dashboard list', () async {
      final (container, api) = await setUpOrder('PENDING');
      expect(api.listCalls, 1);

      await container.read(orderDetailControllerProvider('o1').notifier).accept();
      await container.read(ordersControllerProvider.future);

      expect(api.listCalls, 2);
    });

    test("returns the backend's own error and leaves the order untouched on failure", () async {
      final (container, api) = await setUpOrder('PENDING');
      api.actionError = conflict;

      final error = await container.read(orderDetailControllerProvider('o1').notifier).accept();

      expect(error, 'This order has not been paid for yet');
      expect(container.read(orderDetailControllerProvider('o1')).value?.status, OrderStatus.pending);
      expect(api.detailCalls, 1, reason: 'no re-fetch after a failed transition');
      expect(api.listCalls, 1);
    });

    test('still shows the new status if only the follow-up re-fetch fails', () async {
      final (container, api) = await setUpOrder('ACCEPTED');
      api.detailErrorAfterFirst = const ApiException(message: 'offline', statusCode: -1);

      final error = await container.read(orderDetailControllerProvider('o1').notifier).startPacking();

      expect(error, isNull);
      expect(container.read(orderDetailControllerProvider('o1')).value?.status, OrderStatus.packing);
    });

    test('cancel passes the reason through', () async {
      final (container, api) = await setUpOrder('ACCEPTED');

      final error = await container.read(orderDetailControllerProvider('o1').notifier).cancel(reason: 'Out of stock');

      expect(error, isNull);
      expect(api.lastCancelReason, 'Out of stock');
      expect(container.read(orderDetailControllerProvider('o1')).value?.status, OrderStatus.cancelled);
    });
  });
}
