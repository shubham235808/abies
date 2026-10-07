/// One entry of a `DiagnosticOrder`'s `items[]` — present on `/mine`'s and
/// `/[id]`'s responses (both include `items`), absent (empty) on `/cancel`'s
/// bare response (`orders.service.ts`'s `cancelOrder()` returns a plain
/// `findUniqueOrThrow` with no includes at all).
///
/// Exactly one of [testName]/[packageName] is ever set for a given item —
/// `DiagnosticOrderItem.testId`/`packageId` are themselves mutually exclusive
/// in the schema (`bookOrder()` only ever creates one or the other per
/// item), mirroring `DiagnosticBookingTarget`'s own split.
class DiagnosticOrderItem {
  const DiagnosticOrderItem({required this.testName, required this.packageName, required this.price});

  final String? testName;
  final String? packageName;

  /// Rupees (whole units).
  final int price;

  factory DiagnosticOrderItem.fromJson(Map<String, dynamic> json) {
    final test = json['test'] as Map<String, dynamic>?;
    final package = json['package'] as Map<String, dynamic>?;
    return DiagnosticOrderItem(
      testName: test?['name'] as String?,
      packageName: package?['name'] as String?,
      price: json['price'] as int,
    );
  }
}
