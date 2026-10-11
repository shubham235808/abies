/// The `POST /pharmacies/me/inventory` body — `addInventorySchema`
/// (packages/domain/src/modules/medicines/catalogue.schemas.ts).
///
/// Two ways to name the medicine, exactly as `addInventory` resolves it:
/// - [medicineId]: a batch of a catalogue entry already known (here: one
///   this pharmacy already stocks). Descriptive fields are ignored.
/// - [name]: find-or-create by case-insensitive name
///   (`resolveMedicineByName`). If it already exists, the descriptive
///   fields — including [hsnCode] — only fill gaps, never overwrite.
class NewBatch {
  const NewBatch({
    required this.batchNumber,
    required this.expiryDate,
    required this.quantityAvailable,
    required this.price,
    this.medicineId,
    this.name,
    this.genericName,
    this.form,
    this.strength,
    this.category,
    this.hsnCode,
    this.variantLabel,
    this.requiresPrescription,
    this.isFmcg,
  });

  final String? medicineId;
  final String? name;
  final String? genericName;
  final String? form;
  final String? strength;
  final String? category;
  final String? hsnCode;

  /// Pack size (EXPANSION-1 variant), e.g. "250gm"; null for a single-size product.
  final String? variantLabel;
  final bool? requiresPrescription;
  final bool? isFmcg;
  final String batchNumber;

  /// A calendar date; sent as UTC midnight of that date — the same instant
  /// the web form's `new Date('YYYY-MM-DD').toISOString()` produces.
  final DateTime expiryDate;
  final int quantityAvailable;
  final int price;

  static DateTime utcMidnight(DateTime d) => DateTime.utc(d.year, d.month, d.day);

  Map<String, dynamic> toJson() {
    String? clean(String? v) => (v == null || v.trim().isEmpty) ? null : v.trim();
    final fields = <String, dynamic>{
      'medicineId': medicineId,
      'name': clean(name),
      'genericName': clean(genericName),
      'form': clean(form),
      'strength': clean(strength),
      'category': clean(category),
      'hsnCode': clean(hsnCode),
      'variantLabel': clean(variantLabel),
      'requiresPrescription': requiresPrescription,
      'isFmcg': isFmcg,
      'batchNumber': batchNumber.trim(),
      'expiryDate': utcMidnight(expiryDate).toIso8601String(),
      'quantityAvailable': quantityAvailable,
      'price': price,
    };
    fields.removeWhere((_, v) => v == null);
    return fields;
  }
}

/// Field limits from `addInventorySchema`, checked before a round trip.
/// Returns null when valid. [today] is injectable for tests.
String? validateNewBatch(NewBatch b, {DateTime? today}) {
  final hasId = b.medicineId != null && b.medicineId!.isNotEmpty;
  final name = b.name?.trim() ?? '';
  if (!hasId && name.isEmpty) return 'Enter the medicine name';
  if (name.length > 200) return 'Medicine name must be at most 200 characters';
  for (final (label, value, max) in [
    ('Generic name', b.genericName, 200),
    ('Form', b.form, 100),
    ('Strength', b.strength, 100),
    ('Category', b.category, 100),
    ('HSN code', b.hsnCode, 20),
    ('Pack size', b.variantLabel, 60),
  ]) {
    if ((value?.trim().length ?? 0) > max) return '$label must be at most $max characters';
  }
  final batch = b.batchNumber.trim();
  if (batch.isEmpty) return 'Enter the batch number';
  if (batch.length > 100) return 'Batch number must be at most 100 characters';
  final now = today ?? DateTime.now();
  // addInventory rejects an expiry before "now"; UTC midnight of today is
  // already past, so the earliest acceptable date is tomorrow.
  if (!NewBatch.utcMidnight(b.expiryDate).isAfter(now)) return 'Expiry date must be in the future';
  if (b.quantityAvailable < 0 || b.quantityAvailable > 1000000) return 'Quantity must be between 0 and 1000000';
  if (b.price < 0 || b.price > 1000000) return 'Price must be between ₹0 and ₹1000000';
  return null;
}
