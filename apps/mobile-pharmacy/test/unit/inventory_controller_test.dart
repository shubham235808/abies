import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
import 'package:abies_pharmacy/features/inventory/domain/inventory_item.dart';
import 'package:abies_pharmacy/features/inventory/domain/new_batch.dart';
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

  group('add batch', () {
    late FakeInventoryApi api;
    final nextYear = DateTime(DateTime.now().year + 1, 6, 30);

    setUp(() {
      api = FakeInventoryApi()
        ..items = [
          InventoryItem.fromJson(inventoryJson(id: 'i1', name: 'Triphala Tablets')),
          InventoryItem.fromJson(inventoryJson(id: 'i2', name: 'Neem Capsules', hsn: null)),
        ];
    });

    NewBatch draft({String? name = 'Brahmi Syrup', String batch = 'BR-01', DateTime? expiry, int qty = 30, int price = 95, String? hsn = '3004'}) => NewBatch(
          name: name,
          genericName: '',
          form: 'Syrup',
          strength: '',
          hsnCode: hsn,
          variantLabel: '200ml',
          requiresPrescription: false,
          isFmcg: false,
          batchNumber: batch,
          expiryDate: expiry ?? nextYear,
          quantityAvailable: qty,
          price: price,
        );

    test('a new-by-name batch sends the addInventorySchema body, blanks omitted, expiry as UTC midnight', () {
      final body = draft().toJson();
      expect(body, {
        'name': 'Brahmi Syrup',
        'form': 'Syrup',
        'hsnCode': '3004',
        'variantLabel': '200ml',
        'requiresPrescription': false,
        'isFmcg': false,
        'batchNumber': 'BR-01',
        'expiryDate': '${nextYear.year}-06-30T00:00:00.000Z',
        'quantityAvailable': 30,
        'price': 95,
      });
    });

    test('addBatch inserts the created row in backend order without a reload', () async {
      final container = _container(api);
      await container.read(inventoryControllerProvider.future);

      final error = await container.read(inventoryControllerProvider.notifier).addBatch(draft());

      expect(error, isNull);
      expect(api.lastAddBody!['batchNumber'], 'BR-01');
      final names = container.read(inventoryControllerProvider).value!.map((i) => i.medicineName).toList();
      expect(names, ['Brahmi Syrup', 'Neem Capsules', 'Triphala Tablets']);
      expect(api.listCalls, 1);
    });

    test('validates against addInventorySchema before calling the server', () async {
      final container = _container(api);
      await container.read(inventoryControllerProvider.future);
      final notifier = container.read(inventoryControllerProvider.notifier);

      expect(await notifier.addBatch(draft(name: '  ')), 'Enter the medicine name');
      expect(await notifier.addBatch(draft(batch: ' ')), 'Enter the batch number');
      expect(await notifier.addBatch(draft(hsn: '1' * 21)), contains('HSN code must be at most 20'));
      expect(await notifier.addBatch(draft(qty: 1000001)), contains('Quantity'));
      expect(await notifier.addBatch(draft(price: -1)), contains('Price'));
      expect(await notifier.addBatch(draft(expiry: DateTime(2020))), 'Expiry date must be in the future');
      expect(api.lastAddBody, isNull);
    });

    test("today's date is already past for the backend; tomorrow is the earliest valid expiry", () {
      final now = DateTime.utc(2026, 10, 10, 9);
      expect(validateNewBatch(draft(expiry: DateTime(2026, 10, 10)), today: now), 'Expiry date must be in the future');
      expect(validateNewBatch(draft(expiry: DateTime(2026, 10, 11)), today: now), isNull);
    });

    test('a duplicate batch number surfaces the backend 409 message', () async {
      api.addError = const ApiException(message: 'You already have a batch with this number for this medicine', statusCode: 409);
      final container = _container(api);
      await container.read(inventoryControllerProvider.future);

      final error = await container.read(inventoryControllerProvider.notifier).addBatch(draft());

      expect(error, 'You already have a batch with this number for this medicine');
      expect(container.read(inventoryControllerProvider).value, hasLength(2));
    });

    test('knownMedicines lists each stocked medicine once, by name', () {
      final known = knownMedicines([
        ...api.items,
        InventoryItem.fromJson({...inventoryJson(id: 'i3', name: 'Triphala Tablets'), 'medicineId': 'm-i1'}),
      ]);
      expect(known.map((m) => m.name), ['Neem Capsules', 'Triphala Tablets']);
    });

    test('an existing medicine is referenced by id; descriptive fields are dropped', () {
      final existing = knownMedicines(api.items).firstWhere((m) => m.name == 'Triphala Tablets');
      final body = attachExistingMedicine(draft(), existing).toJson();
      expect(body['medicineId'], 'm-i1');
      expect(body.containsKey('name'), isFalse);
      expect(body.containsKey('hsnCode'), isFalse, reason: 'it already has one; the id path ignores it anyway');
      expect(body['variantLabel'], '200ml');
      expect(body['batchNumber'], 'BR-01');
    });

    test('an existing medicine missing its HSN goes by name so addInventory fills the HSN', () {
      final existing = knownMedicines(api.items).firstWhere((m) => m.name == 'Neem Capsules');
      final body = attachExistingMedicine(draft(hsn: '30049011'), existing).toJson();
      expect(body.containsKey('medicineId'), isFalse);
      expect(body['name'], 'Neem Capsules');
      expect(body['hsnCode'], '30049011');
    });
  });
}
