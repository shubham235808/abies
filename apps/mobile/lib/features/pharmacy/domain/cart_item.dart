/// One entry of a [Cart]'s `items[]`, exactly as `priceCartItems()` in
/// `packages/domain/src/modules/medicines/cart.service.ts` builds it — every
/// `GET`/`POST`/`PATCH`/`DELETE` cart response shares this one shape (that
/// function backs `getCart()`, `addToCart()`, `updateCartItem()`,
/// `removeCartItem()` and `listMyCarts()` alike), unlike Diagnostics/
/// Panchakarma's orders, which have a thin "no includes" response on some
/// actions — a cart response is never thin.
///
/// **[available]/[unitPrice] are resolved live, not a snapshot** — read
/// directly from that function's own comment: "a cart is a pre-purchase
/// intent list, not a receipt". An item this pharmacy no longer stocks
/// enough of comes back `available: false, unitPrice: null` rather than
/// being silently dropped, so the UI can show it as unavailable right in the
/// cart and the checkout flow can refuse to proceed while it's there.
class CartItem {
  const CartItem({
    required this.id,
    required this.medicineId,
    required this.medicineName,
    required this.imageUrl,
    required this.variantId,
    required this.variantLabel,
    required this.quantity,
    required this.unitPrice,
    required this.available,
  });

  final String id;
  final String medicineId;
  final String medicineName;
  final String? imageUrl;
  final String? variantId;
  final String? variantLabel;
  final int quantity;

  /// Rupees (whole units); `null` when [available] is false.
  final int? unitPrice;

  /// False when this pharmacy no longer has enough stock of this exact
  /// medicine+variant to cover [quantity] — the backend's own live check,
  /// never inferred client-side.
  final bool available;

  int get lineTotal => (unitPrice ?? 0) * quantity;

  factory CartItem.fromJson(Map<String, dynamic> json) {
    return CartItem(
      id: json['id'] as String,
      medicineId: json['medicineId'] as String,
      medicineName: json['medicineName'] as String,
      imageUrl: json['imageUrl'] as String?,
      variantId: json['variantId'] as String?,
      variantLabel: json['variantLabel'] as String?,
      quantity: json['quantity'] as int,
      unitPrice: json['unitPrice'] as int?,
      available: json['available'] as bool? ?? false,
    );
  }
}
