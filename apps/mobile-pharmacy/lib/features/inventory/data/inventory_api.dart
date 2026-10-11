import '../../../core/api/api_client.dart';
import '../domain/inventory_item.dart';
import '../domain/new_batch.dart';

/// - `GET   /api/v1/pharmacies/me/inventory`      -> `{inventory}` (`listMyInventory`)
/// - `PATCH /api/v1/pharmacies/me/inventory/:id`  -> `{item}` (`updateInventory`),
///   body `updateInventorySchema` (catalogue.schemas.ts): `quantityAvailable`
///   / `price` ints 0..1,000,000, `expiryDate` ISO datetime — all optional.
///   Needs the `pharmacy.product.update` permission, which PHARMACY has
///   (packages/domain/src/server/permissions.ts line 24). A quantity change
///   writes a MANUAL_CORRECTION stock movement server-side.
/// - `POST  /api/v1/pharmacies/me/inventory`      -> 201 `{item}` (`addInventory`),
///   body `addInventorySchema` (catalogue.schemas.ts — see [NewBatch]).
///   Needs `pharmacy.product.create` (PHARMACY has it). Writes a PURCHASE
///   "Initial stock" movement; 409 on a duplicate batch number for the same
///   medicine; 400 on a past expiry date.
///
/// There is deliberately no delete here — removing a batch is destructive
/// and out of scope for this app.
abstract class InventoryApi {
  Future<List<InventoryItem>> list();

  Future<InventoryItem> add(NewBatch batch);

  Future<InventoryItem> update(String id, {int? quantityAvailable, int? price, DateTime? expiryDate});
}

class InventoryApiImpl implements InventoryApi {
  InventoryApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<InventoryItem>> list() {
    return _client.get<List<InventoryItem>>(
      '/api/v1/pharmacies/me/inventory',
      decode: (json) => ((json as Map<String, dynamic>)['inventory'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(InventoryItem.fromJson)
          .toList(),
    );
  }

  @override
  Future<InventoryItem> add(NewBatch batch) {
    return _client.post<InventoryItem>(
      '/api/v1/pharmacies/me/inventory',
      body: batch.toJson(),
      decode: (json) => InventoryItem.fromJson((json as Map<String, dynamic>)['item'] as Map<String, dynamic>),
    );
  }

  @override
  Future<InventoryItem> update(String id, {int? quantityAvailable, int? price, DateTime? expiryDate}) {
    return _client.patch<InventoryItem>(
      '/api/v1/pharmacies/me/inventory/${Uri.encodeComponent(id)}',
      body: {
        if (quantityAvailable != null) 'quantityAvailable': quantityAvailable,
        if (price != null) 'price': price,
        if (expiryDate != null) 'expiryDate': expiryDate.toUtc().toIso8601String(),
      },
      decode: (json) => InventoryItem.fromJson((json as Map<String, dynamic>)['item'] as Map<String, dynamic>),
    );
  }
}
