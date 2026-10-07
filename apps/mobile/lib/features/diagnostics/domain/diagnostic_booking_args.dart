import 'diagnostic_booking_target.dart';

/// What `DiagnosticBookingScreen` is navigated to with, via `GoRouter`'s
/// `extra` — the target (test(s) or package, never both, see
/// `DiagnosticBookingTarget`) plus an optional `recommendationId` when this
/// booking was started from `DiagnosticRecommendationsScreen`'s "book from
/// this recommendation" action, so `bookOrderSchema`'s own optional
/// `recommendationId` field is threaded through
/// (`packages/domain/src/modules/diagnostics/orders.schemas.ts`).
class DiagnosticBookingArgs {
  const DiagnosticBookingArgs({required this.target, this.recommendationId});

  final DiagnosticBookingTarget target;
  final String? recommendationId;

  @override
  bool operator ==(Object other) =>
      other is DiagnosticBookingArgs && other.target == target && other.recommendationId == recommendationId;

  @override
  int get hashCode => Object.hash(target, recommendationId);
}
