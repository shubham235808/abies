// EXPANSION-1d — shared display for the gated aggregate ratings built in
// EXPANSION-1c (DoctorProfile.rating/reviewCount, Medicine.rating/reviewCount).
// Renders nothing below the review system's own minimum-sample-size
// threshold (rating stays 0 with reviewCount too low to be meaningful) —
// this component doesn't re-decide that threshold, it just reflects it:
// no reviews yet reads as "no badge" rather than a misleading "0 stars".
export function RatingBadge({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  if (reviewCount === 0 || rating === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-neutral-700">
      <span aria-hidden="true" className="text-brand-purple-600">
        ★
      </span>
      {rating.toFixed(1)}
      <span className="text-brand-neutral-400">({reviewCount})</span>
    </span>
  );
}
