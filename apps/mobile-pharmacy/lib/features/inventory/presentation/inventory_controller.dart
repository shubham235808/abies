import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/inventory_api.dart';
import '../domain/inventory_item.dart';

final inventoryApiProvider = Provider<InventoryApi>((ref) => InventoryApiImpl(ref.watch(apiClientProvider)));

/// Mirrors `updateInventorySchema`'s bounds so obviously-invalid input is
/// caught before a round trip; the server still validates authoritatively.
const inventoryMaxValue = 1000000;

/// The pharmacy's own `PharmacyInventory` rows (sorted by the backend:
/// medicine name, then soonest expiry), with in-place quantity/price edits.
class InventoryController extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('InventoryController read before sign-in');
    return ref.watch(inventoryApiProvider).list();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<InventoryItem>>.loading().copyWithPrevious(state);
    state = await AsyncValue.guard(() => ref.read(inventoryApiProvider).list());
  }

  /// Sends only the fields that actually changed (so an unchanged quantity
  /// doesn't create a no-op stock movement). Returns null on success —
  /// replacing the row with the server's response — or an error message.
  Future<String?> updateItem(String id, {required int quantityAvailable, required int price}) async {
    if (quantityAvailable < 0 || quantityAvailable > inventoryMaxValue) {
      return 'Quantity must be between 0 and $inventoryMaxValue';
    }
    if (price < 0 || price > inventoryMaxValue) {
      return 'Price must be between ₹0 and ₹$inventoryMaxValue';
    }
    final current = state.valueOrNull;
    final existing = current?.where((i) => i.id == id).firstOrNull;
    final qtyChanged = existing == null || existing.quantityAvailable != quantityAvailable;
    final priceChanged = existing == null || existing.price != price;
    if (!qtyChanged && !priceChanged) return null;
    try {
      final updated = await ref.read(inventoryApiProvider).update(
            id,
            quantityAvailable: qtyChanged ? quantityAvailable : null,
            price: priceChanged ? price : null,
          );
      final latest = state.valueOrNull;
      if (latest != null) {
        state = AsyncValue.data([for (final i in latest) i.id == id ? updated : i]);
      }
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final inventoryControllerProvider = AsyncNotifierProvider<InventoryController, List<InventoryItem>>(InventoryController.new);

enum InventoryFilter { all, lowStock, expiringSoon }

/// Pure filter used by the inventory screen — kept outside the widget so
/// it's unit-testable.
List<InventoryItem> filterInventory(List<InventoryItem> items, {String query = '', InventoryFilter filter = InventoryFilter.all}) {
  final q = query.trim().toLowerCase();
  return items.where((i) {
    if (q.isNotEmpty && !i.medicineName.toLowerCase().contains(q) && !i.batchNumber.toLowerCase().contains(q)) return false;
    return switch (filter) {
      InventoryFilter.all => true,
      InventoryFilter.lowStock => i.isLowStock,
      InventoryFilter.expiringSoon => i.isExpiringSoon,
    };
  }).toList();
}
