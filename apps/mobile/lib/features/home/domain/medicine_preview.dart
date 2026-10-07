/// Matches one entry of `GET /api/v1/public/medicines`'s `medicines[]`
/// (`packages/domain/src/modules/medicines/catalogue.service.ts`'s
/// `searchPublic()` — the per-(pharmacy, medicine) grouped listing). Only
/// what the home screen's preview card shows.
class MedicinePreview {
  const MedicinePreview({
    required this.medicineId,
    required this.name,
    required this.brandName,
    required this.price,
    required this.imageUrl,
    required this.pharmacyName,
  });

  final String medicineId;
  final String name;
  final String? brandName;
  final num price;
  final String? imageUrl;
  final String? pharmacyName;

  factory MedicinePreview.fromJson(Map<String, dynamic> json) {
    final pharmacy = json['pharmacy'] as Map<String, dynamic>?;
    return MedicinePreview(
      medicineId: json['medicineId'] as String,
      name: json['name'] as String,
      brandName: json['brandName'] as String?,
      price: json['price'] as num,
      imageUrl: json['imageUrl'] as String?,
      pharmacyName: pharmacy?['name'] as String?,
    );
  }
}
