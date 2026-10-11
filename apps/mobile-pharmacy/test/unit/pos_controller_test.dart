import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
import 'package:abies_pharmacy/features/inventory/domain/inventory_item.dart';
import 'package:abies_pharmacy/features/inventory/presentation/inventory_controller.dart';
import 'package:abies_pharmacy/features/pos/domain/pos_sale.dart';
import 'package:abies_pharmacy/features/pos/presentation/pos_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

ProviderContainer _container(FakeInventoryApi inventory, FakePosApi pos) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(FakeAuthApi()..meResult = pharmacyUser),
    inventoryApiProvider.overrideWithValue(inventory),
    posApiProvider.overrideWithValue(pos),
  ]);
  addTearDown(container.dispose);
  return container;
}

InventoryItem _item(String id, {int qty = 50, int price = 100, String? hsn = '3004', String expiry = '2027-12-31T00:00:00.000Z', String? name}) =>
    InventoryItem.fromJson(inventoryJson(id: id, name: name ?? 'Item $id', qty: qty, price: price, hsn: hsn, expiry: expiry));

void main() {
  late FakeInventoryApi inventory;
  late FakePosApi pos;

  setUp(() {
    inventory = FakeInventoryApi()..items = [_item('a', qty: 50, price: 100), _item('b', qty: 2, price: 40)];
    pos = FakePosApi(inventory: inventory, ratePercent: 12);
  });

  group('PosCartController cart', () {
    test('adding the same batch twice bumps one line, capped at stock on hand', () {
      final c = _container(inventory, pos);
      final cart = c.read(posCartProvider.notifier);
      final b = inventory.items[1];

      expect(cart.add(b), isNull);
      expect(cart.add(b), isNull);
      expect(cart.add(b), contains('Only 2'));
      expect(c.read(posCartProvider).single.quantity, 2);
      expect(cart.subtotal, 80);
    });

    test('refuses expired and out-of-stock batches', () {
      final cart = _container(inventory, pos).read(posCartProvider.notifier);
      expect(cart.add(_item('x', expiry: '2020-01-01T00:00:00.000Z')), contains('expired'));
      expect(cart.add(_item('y', qty: 0)), contains('out of stock'));
    });

    test('setQuantity clamps to 1..stock, remove drops the line', () {
      final c = _container(inventory, pos);
      final cart = c.read(posCartProvider.notifier);
      cart.add(inventory.items[0]);
      cart.setQuantity('a', 999);
      expect(c.read(posCartProvider).single.quantity, 50);
      cart.setQuantity('a', 0);
      expect(c.read(posCartProvider).single.quantity, 1);
      cart.remove('a');
      expect(c.read(posCartProvider), isEmpty);
    });

    test('sellableInventory hides out-of-stock and expired batches and matches name/batch/HSN', () {
      final items = [
        _item('a', name: 'Triphala'),
        _item('z', name: 'Brahmi', qty: 0),
        _item('e', name: 'Neem', expiry: '2020-01-01T00:00:00.000Z'),
        _item('h', name: 'Tulsi', hsn: '30049011'),
      ];
      expect(sellableInventory(items).map((i) => i.id), ['a', 'h']);
      expect(sellableInventory(items, query: 'tri').map((i) => i.id), ['a']);
      expect(sellableInventory(items, query: '30049011').map((i) => i.id), ['h']);
      expect(sellableInventory(items, query: 'batch-h').map((i) => i.id), ['h']);
    });
  });

  group('PosCartController.checkout', () {
    test("records the sale, shows the server's CGST/SGST split, and re-reads decremented stock", () async {
      final c = _container(inventory, pos);
      await c.read(inventoryControllerProvider.future);
      final cart = c.read(posCartProvider.notifier);
      cart.add(inventory.items[0]);
      cart.setQuantity('a', 5);

      final result = await cart.checkout(paymentMethod: 'CASH');

      expect(result.error, isNull);
      expect(pos.lastSaleBody, {
        'paymentMethod': 'CASH',
        'discountAmount': 0,
        'items': [
          {'medicineId': 'm-a', 'batchNumber': 'BATCH-a', 'quantity': 5},
        ],
      });
      // Same numbers as tests/integration/medicines.test.ts "POS / GST (ENTERPRISE-7)".
      final sale = result.sale!;
      expect(sale.subtotal, 500);
      expect(sale.taxAmount, 60);
      expect(sale.totalAmount, 560);
      expect(sale.invoice!.cgst, 30);
      expect(sale.invoice!.sgst, 30);
      expect(sale.invoice!.igst, 0);
      expect(result.remainingStock, {posBatchKey('m-a', 'BATCH-a'): 45});
      expect(c.read(inventoryControllerProvider).value!.firstWhere((i) => i.id == 'a').quantityAvailable, 45);
      expect(c.read(posCartProvider), isEmpty, reason: 'cart clears after a recorded sale');
    });

    test('an odd tax amount splits CGST down, SGST up — as computed server-side', () async {
      inventory.items = [_item('a', qty: 10, price: 105)];
      final c = _container(inventory, FakePosApi(inventory: inventory, ratePercent: 5));
      await c.read(inventoryControllerProvider.future);
      final cart = c.read(posCartProvider.notifier)..add(inventory.items[0]);

      final sale = (await cart.checkout(paymentMethod: 'UPI', upiReference: ' 4321 ', customerName: ' Asha ')).sale!;

      expect(sale.taxAmount, 5); // round(105 * 5%) = round(5.25)
      expect(sale.invoice!.cgst, 2);
      expect(sale.invoice!.sgst, 3);
      expect(sale.upiReference, '4321');
      expect(sale.customerName, 'Asha');
    });

    test('UPI reference is only sent for UPI payments', () async {
      final c = _container(inventory, pos);
      await c.read(inventoryControllerProvider.future);
      final cart = c.read(posCartProvider.notifier)..add(inventory.items[0]);

      await cart.checkout(paymentMethod: 'CARD', upiReference: 'leftover');

      expect(pos.lastSaleBody!.containsKey('upiReference'), isFalse);
      expect(pos.lastSaleBody!['paymentMethod'], 'CARD');
    });

    test('refuses locally: empty cart, missing HSN (backend wording), discount above subtotal', () async {
      inventory.items = [...inventory.items, _item('n', name: 'No-HSN Balm', hsn: null)];
      final c = _container(inventory, pos);
      await c.read(inventoryControllerProvider.future);
      final cart = c.read(posCartProvider.notifier);

      expect((await cart.checkout(paymentMethod: 'CASH')).error, 'Add at least one item.');

      cart.add(inventory.items.last);
      expect(
        (await cart.checkout(paymentMethod: 'CASH')).error,
        'No-HSN Balm has no HSN code set — add one in the inventory before selling it at the counter.',
      );
      cart.remove('n');

      cart.add(inventory.items[1]); // ₹40
      expect((await cart.checkout(paymentMethod: 'CASH', discountAmount: 41)).error, contains('more than the subtotal'));
      expect((await cart.checkout(paymentMethod: 'RAZORPAY')).error, 'Choose a payment method');
      expect(pos.saleCalls, 0);
    });

    test('a backend refusal is surfaced verbatim and the cart is kept', () async {
      pos.saleError = const ApiException(message: 'Set up GST registration under Tax Settings before recording a sale.', statusCode: 400);
      final c = _container(inventory, pos);
      await c.read(inventoryControllerProvider.future);
      final cart = c.read(posCartProvider.notifier)..add(inventory.items[0]);

      final result = await cart.checkout(paymentMethod: 'CASH');

      expect(result.ok, isFalse);
      expect(result.error, 'Set up GST registration under Tax Settings before recording a sale.');
      expect(c.read(posCartProvider), hasLength(1));
      expect(inventory.items[0].quantityAvailable, 50);
    });

    test('the sales list includes the new sale after checkout', () async {
      final c = _container(inventory, pos);
      await c.read(inventoryControllerProvider.future);
      expect(await c.read(posSalesProvider.future), isEmpty);
      final cart = c.read(posCartProvider.notifier)..add(inventory.items[0]);

      await cart.checkout(paymentMethod: 'CASH');

      expect((await c.read(posSalesProvider.future)).single.invoice!.invoiceNumber, 'INV-000001');
    });
  });

  test('PosSale.fromJson reads the getSale shape (items, invoice, pharmacy.taxSettings)', () {
    final sale = PosSale.fromJson({
      'id': 's1',
      'paymentMethod': 'CASH',
      'subtotal': 500,
      'discountAmount': 0,
      'taxAmount': 60,
      'totalAmount': 560,
      'createdAt': '2026-10-10T09:30:00.000Z',
      'items': [
        {'medicineId': 'm1', 'batchNumber': 'B1', 'quantity': 5, 'unitPrice': 100, 'taxRate': 12, 'medicine': {'name': 'Triphala'}},
      ],
      'invoice': {'invoiceNumber': 'TP-000001', 'cgst': 30, 'sgst': 30, 'igst': 0, 'totalTax': 60, 'totalAmount': 560},
      'pharmacy': {
        'name': 'Shree',
        'taxSettings': {'legalBusinessName': 'Shree LLP', 'gstin': '27AAAAA0000A1Z5', 'registeredState': 'Maharashtra'},
      },
    });
    expect(sale.items.single.lineAmount, 500);
    expect(sale.itemCount, 5);
    expect(sale.invoice!.invoiceNumber, 'TP-000001');
    expect(sale.sellerLegalName, 'Shree LLP');
    expect(sale.sellerGstin, '27AAAAA0000A1Z5');
  });
}
