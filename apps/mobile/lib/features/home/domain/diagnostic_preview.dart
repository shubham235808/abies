/// Matches one entry of `GET /api/v1/public/diagnostics`'s `tests[]`
/// (`packages/domain/src/modules/diagnostics/catalogue.service.ts`'s
/// `searchPublic()`). Only what the home screen's preview card shows.
class DiagnosticPreview {
  const DiagnosticPreview({
    required this.id,
    required this.name,
    required this.price,
    required this.turnaroundHours,
    required this.labName,
  });

  final String id;
  final String name;
  final num price;
  final int turnaroundHours;
  final String? labName;

  factory DiagnosticPreview.fromJson(Map<String, dynamic> json) {
    final lab = json['lab'] as Map<String, dynamic>?;
    return DiagnosticPreview(
      id: json['id'] as String,
      name: json['name'] as String,
      price: json['price'] as num,
      turnaroundHours: json['turnaroundHours'] as int,
      labName: lab?['name'] as String?,
    );
  }
}
