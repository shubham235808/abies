import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/inventory_api.dart';
import '../domain/inventory_item.dart';
import '../domain/new_batch.dart';

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

  /// `POST /pharmacies/me/inventory`. Validates against
  /// `addInventorySchema` first; on success inserts the server's row in the
  /// backend's own list order (medicine name, then soonest expiry) without
  /// a full reload. Returns null on success or a user-facing error (e.g.
  /// the backend's 409 "You already have a batch with this number for this
  /// medicine").
  Future<String?> addBatch(NewBatch batch) async {
    final invalid = validateNewBatch(batch);
    if (invalid != null) return invalid;
    try {
      final created = await ref.read(inventoryApiProvider).add(batch);
      final latest = state.valueOrNull;
      if (latest != null) state = AsyncValue.data(sortInventory([...latest, created]));
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

/// `listMyInventory`'s ordering: medicine name, then soonest expiry.
List<InventoryItem> sortInventory(List<InventoryItem> items) {
  final sorted = [...items];
  sorted.sort((a, b) {
    final byName = a.medicineName.toLowerCase().compareTo(b.medicineName.toLowerCase());
    return byName != 0 ? byName : a.expiryDate.compareTo(b.expiryDate);
  });
  return sorted;
}

/// A medicine this pharmacy already stocks — offered as a pick-list on the
/// add-batch form so a new batch attaches to the exact catalogue entry.
class KnownMedicine {
  const KnownMedicine({required this.id, required this.name, this.form, this.strength, this.hsnCode});

  final String id;
  final String name;
  final String? form;
  final String? strength;
  final String? hsnCode;
}

/// Distinct medicines across the pharmacy's batches, by name.
List<KnownMedicine> knownMedicines(List<InventoryItem> items) {
  final byId = <String, KnownMedicine>{};
  for (final i in items) {
    if (i.medicineId.isEmpty) continue;
    final existing = byId[i.medicineId];
    if (existing == null || (existing.hsnCode == null && i.hsnCode != null)) {
      byId[i.medicineId] = KnownMedicine(id: i.medicineId, name: i.medicineName, form: i.form, strength: i.strength, hsnCode: i.hsnCode);
    }
  }
  final list = byId.values.toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return list;
}

/// How the add-batch form names an existing medicine on the wire.
///
/// Normally by `medicineId` — exact. But `addInventory`'s medicineId path
/// ignores `hsnCode`, and the only pharmacy-side way to give an existing
/// medicine its missing HSN code (which the POS needs) is the by-name path,
/// whose `resolveMedicineByName` fills empty fields. So when the user picked
/// an existing medicine that has no HSN yet and typed one, send its name
/// instead of its id.
NewBatch attachExistingMedicine(NewBatch draft, KnownMedicine existing) {
  final fillsHsn = existing.hsnCode == null && (draft.hsnCode?.trim().isNotEmpty ?? false);
  return NewBatch(
    medicineId: fillsHsn ? null : existing.id,
    name: fillsHsn ? existing.name : null,
    hsnCode: fillsHsn ? draft.hsnCode : null,
    variantLabel: draft.variantLabel,
    batchNumber: draft.batchNumber,
    expiryDate: draft.expiryDate,
    quantityAvailable: draft.quantityAvailable,
    price: draft.price,
  );
}
