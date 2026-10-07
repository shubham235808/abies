import 'medicine_summary.dart';

/// `GET /api/v1/public/medicines`'s full response — `{ total, medicines }`
/// (`searchPublic()`'s return statement). Like Phase 5/6's own search
/// results, the route echoes neither `limit` nor `offset` back, so the
/// controller that paginates this tracks the offset it itself last
/// requested.
class MedicineSearchResult {
  const MedicineSearchResult({required this.total, required this.medicines});

  final int total;
  final List<MedicineSummary> medicines;

  factory MedicineSearchResult.fromJson(Map<String, dynamic> json) {
    return MedicineSearchResult(
      total: json['total'] as int? ?? 0,
      medicines: (json['medicines'] as List<dynamic>? ?? const []).map((e) => MedicineSummary.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
