/// One entry of `GET /api/v1/public/medicines/[id]/reviews`'s `reviews[]`
/// (`listForMedicine()` in `packages/domain/src/modules/reviews/
/// reviews.service.ts`) — already `status: 'PUBLISHED'`-filtered server-side,
/// so every row returned here is safe to show.
class MedicineReview {
  const MedicineReview({required this.id, required this.rating, required this.comment, required this.createdAt, required this.authorName});

  final String id;
  final int rating;
  final String? comment;
  final DateTime createdAt;
  final String? authorName;

  factory MedicineReview.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>?;
    final patientProfile = author?['patientProfile'] as Map<String, dynamic>?;
    final name = [patientProfile?['firstName'] as String?, patientProfile?['lastName'] as String?]
        .where((p) => p != null && p.isNotEmpty)
        .join(' ');
    return MedicineReview(
      id: json['id'] as String,
      rating: json['rating'] as int,
      comment: json['comment'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      authorName: name.isEmpty ? null : name,
    );
  }
}
