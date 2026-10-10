import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
import 'package:abies_pharmacy/features/inventory/domain/inventory_item.dart';
import 'package:abies_pharmacy/features/inventory/presentation/inventory_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

ProviderContainer _container(FakeInventoryApi api) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(FakeAuthApi()..meResult = pharmacyUser),
    inventoryApiProvider.overrideWithValue(api),
  ]);
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('InventoryController', () {
    late FakeInventoryApi api;

    setUp(() {
      api = FakeInventoryApi()
        ..items = [
          InventoryItem.fromJson(inventoryJson(id: 'i1', name: 'Triphala Tablets', qty: 25, price: 120)),
          InventoryItem.fromJson(inventoryJson(id: 'i2', name: 'Chyawanprash', qty: 4, price: 300)),
        ];
    });

    test('loads the pharmacy inventory', () async {
      final list = await _container(api).read(inventoryControllerProvider.future);
      expect(list.map((i) => i.id), ['i1', 'i2']);
    });

    test('updateItem sends only the changed field and replaces the row in place', () async {
      final container = _container(api);
      await container.read(inventoryControllerProvider.future);

      final error = await container.read(inventoryControllerProvider.notifier).updateItem('i1', quantityAvailable: 40, price: 120);

      expect(error, isNull);
      expect(api.lastUpdate, {'id': 'i1', 'quantityAvailable': 40, 'price': null});
      final list = container.read(inventoryControllerProvider).value!;
      expect(list.first.quantityAvailable, 40);
      expect(list.map((i) => i.id), ['i1', 'i2'], reason: 'order preserved');
      expect(api.listCalls, 1, reason: 'no full reload needed');
    });

    test('updateItem with nothing changed makes no call', () async {
      final container = _container(api);
      await container.read(inventoryControllerProvider.future);

      final error = await container.read(inventoryControllerProvider.notifier).updateItem('i2', quantityAvailable: 4, price: 300);

      expect(error, isNull);
      expect(api.lastUpdate, isNull);
    });

    test('updateItem rejects out-of-range values before calling the server', () async {
      final container = _container(api);
      await container.read(inventoryControllerProvider.future);
      final notifier = container.read(inventoryControllerProvider.notifier);

      expect(await notifier.updateItem('i1', quantityAvailable: -1, price: 10), contains('Quantity'));
      expect(await notifier.updateItem('i1', quantityAvailable: 1, price: 1000001), contains('Price'));
      expect(api.lastUpdate, isNull);
    });

    test('updateItem returns the backend error and keeps the old row', () async {
      api.updateError = const ApiException(message: 'Inventory batch not found', statusCode: 404);
      final container = _container(api);
      await container.read(inventoryControllerProvider.future);

      final error = await container.read(inventoryControllerProvider.notifier).updateItem('i1', quantityAvailable: 2, price: 99);

      expect(error, 'Inventory batch not found');
      expect(container.read(inventoryControllerProvider).value!.first.price, 120);
    });
  });

  group('inventory filters', () {
    final items = [
      InventoryItem.fromJson(inventoryJson(id: 'a', name: 'Triphala Tablets', qty: 50)),
      InventoryItem.fromJson(inventoryJson(id: 'b', name: 'Brahmi Syrup', qty: 3)),
      InventoryItem.fromJson(inventoryJson(
        id: 'c',
        name: 'Neem Capsules',
        qty: 30,
        expiry: DateTime.now().add(const Duration(days: 10)).toUtc().toIso8601String(),
      )),
    ];

    test('search matches medicine name or batch, case-insensitively', () {
      expect(filterInventory(items, query: 'brahmi').map((i) => i.id), ['b']);
      expect(filterInventory(items, query: 'batch-c').map((i) => i.id), ['c']);
    });

    test('low stock is under 10, expiring is within 30 days', () {
      expect(filterInventory(items, filter: InventoryFilter.lowStock).map((i) => i.id), ['b']);
      expect(filterInventory(items, filter: InventoryFilter.expiringSoon).map((i) => i.id), ['c']);
    });

    test('an already-expired batch is not "expiring soon"', () {
      final expired = InventoryItem.fromJson(inventoryJson(id: 'x', expiry: '2020-01-01T00:00:00.000Z'));
      expect(expired.isExpiringSoon, isFalse);
      expect(expired.isExpired, isTrue);
    });
  });
}
