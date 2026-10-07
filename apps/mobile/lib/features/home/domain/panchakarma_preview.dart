/// Matches one entry of `GET /api/v1/public/panchakarma`'s `therapies[]`
/// (`packages/domain/src/modules/panchakarma/catalogue.service.ts`'s
/// `searchPublic()`). Only what the home screen's preview card shows.
class PanchakarmaPreview {
  const PanchakarmaPreview({
    required this.id,
    required this.name,
    required this.durationMinutes,
    required this.price,
    required this.centreName,
    required this.centreCity,
  });

  final String id;
  final String name;
  final int durationMinutes;
  final num price;
  final String? centreName;
  final String? centreCity;

  factory PanchakarmaPreview.fromJson(Map<String, dynamic> json) {
    final centre = json['centre'] as Map<String, dynamic>?;
    return PanchakarmaPreview(
      id: json['id'] as String,
      name: json['name'] as String,
      durationMinutes: json['durationMinutes'] as int,
      price: json['price'] as num,
      centreName: centre?['name'] as String?,
      centreCity: centre?['city'] as String?,
    );
  }
}
