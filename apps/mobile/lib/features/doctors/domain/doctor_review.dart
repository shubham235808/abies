/// One row of `GET /api/v1/public/doctors/[slug]/reviews`'s `reviews[]`
/// (`listForDoctorBySlug()` → `listForDoctor()` in
/// `packages/domain/src/modules/reviews/reviews.service.ts`), which includes
/// `author.patientProfile.{firstName,lastName}` — the only identity ever
/// shown for a reviewer, never the author's raw user id/mobile/email.
class DoctorReview {
  const DoctorReview({
    required this.id,
    required this.rating,
    required this.comment,
    required this.createdAt,
    required this.authorName,
  });

  final String id;
  final int rating;
  final String? comment;
  final DateTime createdAt;

  /// `author.patientProfile.firstName`/`lastName`, joined — "ABIES patient"
  /// if both are blank (a bare profile with no name set yet), never null, so
  /// the review list always has something to show.
  final String authorName;

  factory DoctorReview.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>?;
    final patientProfile = author?['patientProfile'] as Map<String, dynamic>?;
    final name = [patientProfile?['firstName'] as String?, patientProfile?['lastName'] as String?]
        .where((p) => p != null && p.isNotEmpty)
        .join(' ');
    return DoctorReview(
      id: json['id'] as String,
      rating: json['rating'] as int,
      comment: json['comment'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      authorName: name.isEmpty ? 'ABIES patient' : name,
    );
  }
}
