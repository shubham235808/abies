/// `POST /api/v1/appointments/[id]/review`'s response — the created
/// `Review` row (`reviewDoctor()` in `packages/domain/src/modules/reviews/
/// reviews.service.ts`), returned with no `author` join (unlike the public
/// reviews list) since the caller already knows who they are. Only the
/// fields this app actually uses after submitting are kept.
class ReviewSubmission {
  const ReviewSubmission({required this.id, required this.rating, required this.comment});

  final String id;
  final int rating;
  final String? comment;

  factory ReviewSubmission.fromJson(Map<String, dynamic> json) {
    return ReviewSubmission(
      id: json['id'] as String,
      rating: json['rating'] as int,
      comment: json['comment'] as String?,
    );
  }
}
