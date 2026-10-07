/// `POST /api/v1/medicine-orders/[id]/review`'s response — the created
/// `Review` row (`reviewMedicine()` in `packages/domain/src/modules/
/// reviews/reviews.service.ts`), returned with no `author` join (unlike the
/// public medicine-reviews list) since the caller already knows who they
/// are. Only the fields this app actually uses after submitting are kept —
/// same shape/rationale as Phase 4's `ReviewSubmission` for appointments,
/// kept as its own small class here rather than a cross-feature import,
/// same per-feature independence every phase's domain layer has used.
class MedicineReviewSubmission {
  const MedicineReviewSubmission({required this.id, required this.rating, required this.comment});

  final String id;
  final int rating;
  final String? comment;

  factory MedicineReviewSubmission.fromJson(Map<String, dynamic> json) {
    return MedicineReviewSubmission(
      id: json['id'] as String,
      rating: json['rating'] as int,
      comment: json['comment'] as String?,
    );
  }
}
