import 'cart_item.dart';

/// One patient cart, scoped to exactly one pharmacy — `getCart()`'s return
/// shape in `packages/domain/src/modules/medicines/cart.service.ts`:
/// `{ id, pharmacy: {id, name}, status, items, subtotal }`. A patient can
/// have several of these at once, one per pharmacy they've added an item
/// from (EXPANSION-1b — `addToCart()` finds-or-creates one active cart per
/// `(patient, pharmacy)` pair), which is why `GET /api/v1/patients/me/cart`
/// returns `{ carts: [...] }` (plural, `listMyCarts()`), never a single
/// cart. [CartScreen] shows every active cart as its own section with its
/// own checkout action, never one merged cross-pharmacy list.
class Cart {
  const Cart({required this.id, required this.pharmacyId, required this.pharmacyName, required this.status, required this.items, required this.subtotal});

  final String id;
  final String pharmacyId;
  final String? pharmacyName;

  /// `CartStatus`: ACTIVE or CONVERTED (`packages/domain/prisma/
  /// schema.prisma`). `listMyCarts()` already filters to ACTIVE-with-items
  /// only, so every cart this app ever renders is ACTIVE.
  final String status;
  final List<CartItem> items;

  /// Rupees (whole units) — `sum(unitPrice * quantity)` over [items],
  /// computed server-side from each item's live price. Never recomputed
  /// client-side as authoritative; this is just what the backend already
  /// says it is.
  final int subtotal;

  bool get hasUnavailableItems => items.any((i) => !i.available);

  factory Cart.fromJson(Map<String, dynamic> json) {
    final pharmacy = json['pharmacy'] as Map<String, dynamic>?;
    final items = json['items'] as List<dynamic>? ?? const [];
    return Cart(
      id: json['id'] as String,
      pharmacyId: pharmacy?['id'] as String? ?? '',
      pharmacyName: pharmacy?['name'] as String?,
      status: json['status'] as String,
      items: items.map((e) => CartItem.fromJson(e as Map<String, dynamic>)).toList(),
      subtotal: json['subtotal'] as int,
    );
  }
}
