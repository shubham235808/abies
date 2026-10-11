import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../inventory/domain/inventory_item.dart';
import '../../inventory/presentation/inventory_controller.dart';
import '../data/pos_api.dart';
import '../domain/pos_sale.dart';

final posApiProvider = Provider<PosApi>((ref) => PosApiImpl(ref.watch(apiClientProvider)));

/// `posSaleSchema` bounds.
const posMaxLines = 50;
const posMaxQuantity = 1000;

/// One cart line = one inventory batch (the backend resolves a sale line by
/// medicineId + batchNumber, priced at that batch's own selling price).
class PosCartLine {
  const PosCartLine({
    required this.inventoryId,
    required this.medicineId,
    required this.medicineName,
    required this.batchNumber,
    required this.unitPrice,
    required this.maxQuantity,
    required this.quantity,
    this.hsnCode,
  });

  final String inventoryId;
  final String medicineId;
  final String medicineName;
  final String batchNumber;
  final int unitPrice;

  /// Stock on hand when added — the server re-checks authoritatively.
  final int maxQuantity;
  final int quantity;
  final String? hsnCode;

  int get lineAmount => unitPrice * quantity;

  PosCartLine withQuantity(int q) => PosCartLine(
        inventoryId: inventoryId,
        medicineId: medicineId,
        medicineName: medicineName,
        batchNumber: batchNumber,
        unitPrice: unitPrice,
        maxQuantity: maxQuantity,
        quantity: q,
        hsnCode: hsnCode,
      );
}

/// What a successful checkout hands the receipt screen: the server's own
/// sale (with its CGST/SGST split) and each sold batch's stock as re-read
/// from `GET /inventory` afterwards — proof the decrement actually landed,
/// not a locally-subtracted guess.
class PosCheckoutResult {
  const PosCheckoutResult({this.sale, this.error, this.remainingStock = const {}});

  final PosSale? sale;
  final String? error;

  /// [posBatchKey] (medicineId + batchNumber, how a sale line names its
  /// batch) -> quantityAvailable after the sale. Empty if the inventory
  /// reload failed.
  final Map<String, int> remainingStock;

  bool get ok => sale != null;
}

String posBatchKey(String medicineId, String batchNumber) => '$medicineId|$batchNumber';

/// Batches that can be rung up: in stock and not expired. (The backend's
/// `recordSale` itself doesn't check expiry; the counter shouldn't offer an
/// expired batch at all.)
List<InventoryItem> sellableInventory(List<InventoryItem> items, {String query = ''}) {
  final q = query.trim().toLowerCase();
  return items.where((i) {
    if (i.quantityAvailable <= 0 || i.isExpired) return false;
    if (q.isEmpty) return true;
    return i.medicineName.toLowerCase().contains(q) ||
        i.batchNumber.toLowerCase().contains(q) ||
        (i.hsnCode?.toLowerCase().contains(q) ?? false);
  }).toList();
}

/// The POS cart (local state only, until checkout).
class PosCartController extends Notifier<List<PosCartLine>> {
  @override
  List<PosCartLine> build() => const [];

  int get subtotal => state.fold(0, (sum, l) => sum + l.lineAmount);

  /// Adds one unit of [item] (or bumps its existing line). Returns null on
  /// success or why it couldn't be added.
  String? add(InventoryItem item) {
    if (item.isExpired) return 'Batch ${item.batchNumber} has expired and cannot be sold';
    if (item.quantityAvailable <= 0) return '${item.displayName} is out of stock';
    final index = state.indexWhere((l) => l.inventoryId == item.id);
    if (index >= 0) {
      final line = state[index];
      if (line.quantity >= line.maxQuantity || line.quantity >= posMaxQuantity) {
        return 'Only ${line.maxQuantity} of ${item.displayName} (batch ${item.batchNumber}) in stock';
      }
      state = [for (var i = 0; i < state.length; i++) i == index ? line.withQuantity(line.quantity + 1) : state[i]];
      return null;
    }
    if (state.length >= posMaxLines) return 'A sale can have at most $posMaxLines lines';
    state = [
      ...state,
      PosCartLine(
        inventoryId: item.id,
        medicineId: item.medicineId,
        medicineName: item.displayName,
        batchNumber: item.batchNumber,
        unitPrice: item.price,
        maxQuantity: item.quantityAvailable,
        quantity: 1,
        hsnCode: item.hsnCode,
      ),
    ];
    return null;
  }

  /// Clamped to 1..min(stock on hand, 1000).
  void setQuantity(String inventoryId, int quantity) {
    state = [
      for (final l in state)
        if (l.inventoryId == inventoryId)
          l.withQuantity(quantity.clamp(1, l.maxQuantity < posMaxQuantity ? l.maxQuantity : posMaxQuantity))
        else
          l,
    ];
  }

  void remove(String inventoryId) => state = [for (final l in state) if (l.inventoryId != inventoryId) l];

  void clear() => state = const [];

  /// Records the sale. Pre-checks what the server would refuse anyway
  /// (empty cart, item with no HSN code — same wording as `recordSale`) plus
  /// the schema's field bounds; tax is never computed here, only displayed
  /// from the server's response. On success the cart clears, inventory is
  /// re-fetched, and the sales list is invalidated.
  Future<PosCheckoutResult> checkout({
    required String paymentMethod,
    String customerName = '',
    String customerPhone = '',
    String upiReference = '',
    int discountAmount = 0,
  }) async {
    final lines = state;
    if (lines.isEmpty) return const PosCheckoutResult(error: 'Add at least one item.');
    if (!posPaymentMethods.contains(paymentMethod)) return const PosCheckoutResult(error: 'Choose a payment method');
    for (final l in lines) {
      if (l.hsnCode == null || l.hsnCode!.trim().isEmpty) {
        return PosCheckoutResult(
          error: '${l.medicineName} has no HSN code set — add one in the inventory before selling it at the counter.',
        );
      }
    }
    if (discountAmount < 0) return const PosCheckoutResult(error: 'Discount cannot be negative');
    if (discountAmount > subtotal) return PosCheckoutResult(error: 'Discount cannot be more than the subtotal (₹$subtotal)');
    final name = customerName.trim();
    final phone = customerPhone.trim();
    final upi = upiReference.trim();
    if (name.length > 200) return const PosCheckoutResult(error: 'Customer name must be at most 200 characters');
    if (phone.length > 20) return const PosCheckoutResult(error: 'Customer phone must be at most 20 characters');
    if (upi.length > 100) return const PosCheckoutResult(error: 'UPI reference must be at most 100 characters');

    final request = PosSaleRequest(
      paymentMethod: paymentMethod,
      discountAmount: discountAmount,
      customerName: name.isEmpty ? null : name,
      customerPhone: phone.isEmpty ? null : phone,
      // Only sent for UPI, as on the web terminal.
      upiReference: paymentMethod == 'UPI' && upi.isNotEmpty ? upi : null,
      items: [for (final l in lines) PosSaleLineRequest(medicineId: l.medicineId, batchNumber: l.batchNumber, quantity: l.quantity)],
    );

    final PosSale sale;
    try {
      sale = await ref.read(posApiProvider).recordSale(request);
    } on ApiException catch (e) {
      return PosCheckoutResult(error: e.message);
    }

    state = const [];
    ref.invalidate(posSalesProvider);
    final inventory = ref.read(inventoryControllerProvider.notifier);
    await inventory.refresh();
    final refreshed = ref.read(inventoryControllerProvider).valueOrNull ?? const <InventoryItem>[];
    final sold = {for (final l in lines) posBatchKey(l.medicineId, l.batchNumber)};
    return PosCheckoutResult(
      sale: sale,
      remainingStock: {
        for (final i in refreshed)
          if (sold.contains(posBatchKey(i.medicineId, i.batchNumber))) posBatchKey(i.medicineId, i.batchNumber): i.quantityAvailable,
      },
    );
  }
}

final posCartProvider = NotifierProvider<PosCartController, List<PosCartLine>>(PosCartController.new);

/// Recent counter sales, newest first (backend caps at 100).
final posSalesProvider = FutureProvider.autoDispose<List<PosSale>>((ref) async {
  final auth = await ref.watch(authControllerProvider.future);
  if (!auth.isSignedIn) throw StateError('posSalesProvider read before sign-in');
  return ref.watch(posApiProvider).listSales();
});

final posSaleProvider = FutureProvider.autoDispose.family<PosSale, String>((ref, id) async {
  final auth = await ref.watch(authControllerProvider.future);
  if (!auth.isSignedIn) throw StateError('posSaleProvider read before sign-in');
  return ref.watch(posApiProvider).getSale(id);
});
