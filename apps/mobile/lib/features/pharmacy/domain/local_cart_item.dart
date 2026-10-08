/// One entry of the on-device-only cart shown to a signed-out visitor
/// (brief: "Allow adding products to the cart without login" — see
/// `lib/core/router/app_router.dart`'s redirect doc comment for why
/// `/pharmacy/cart` never calls the real `/patients/me/cart` for a guest).
///
/// Mirrors [CartItem]'s displayed fields (`lib/features/pharmacy/domain/
/// cart_item.dart`), but **nothing here has ever touched the backend** —
/// [unitPrice] is just the price the catalogue/detail screen already showed
/// when this was added (`MedicineSummary`/`MedicineVariantOption`), never
/// re-verified live the way a real `CartItem.unitPrice` is. The real cart
/// item this becomes once the patient signs in
/// (`LocalCartController.flushToBackend`) gets its authoritative price from
/// the backend at that point, same as any other `addToCart()` call.
class LocalCartItem {
  const LocalCartItem({
    required this.pharmacyId,
    required this.pharmacyName,
    required this.medicineId,
    required this.medicineName,
    required this.imageUrl,
    required this.variantId,
    required this.variantLabel,
    required this.unitPrice,
    required this.quantity,
  });

  final String pharmacyId;
  final String? pharmacyName;
  final String medicineId;
  final String medicineName;
  final String? imageUrl;
  final String? variantId;
  final String? variantLabel;

  /// Rupees (whole units) — a client-side snapshot, not authoritative (see
  /// class doc comment).
  final int unitPrice;
  final int quantity;

  /// Identity for merge/update/remove — one row per (pharmacy, medicine,
  /// variant), exactly the same identity the backend's own `addToCart()`
  /// finds-or-creates a real cart item on (`cart.service.ts`).
  String get key => '$pharmacyId::$medicineId::${variantId ?? ''}';

  int get lineTotal => unitPrice * quantity;

  LocalCartItem copyWith({int? quantity}) => LocalCartItem(
        pharmacyId: pharmacyId,
        pharmacyName: pharmacyName,
        medicineId: medicineId,
        medicineName: medicineName,
        imageUrl: imageUrl,
        variantId: variantId,
        variantLabel: variantLabel,
        unitPrice: unitPrice,
        quantity: quantity ?? this.quantity,
      );
}
