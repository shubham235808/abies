import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/panchakarma_booking_creation.dart';
import '../domain/panchakarma_therapy.dart';
import 'panchakarma_search_controller.dart';

enum PanchakarmaBookOutcomeKind {
  /// Nothing attempted yet, or the user changed the session count since the
  /// last attempt.
  none,
  success,

  /// `bookTherapy()`'s `ServiceUnavailableError` — Razorpay isn't configured
  /// in this environment (the expected state in dev right now, not a bug).
  /// Must be shown as a normal, calm, displayable state, never a crash —
  /// exactly `HoldOutcomeKind.serviceUnavailable`'s role in Phase 4.
  serviceUnavailable,

  /// The therapy is no longer offered at this centre — either this
  /// controller's own re-fetch-before-booking check didn't find it anymore,
  /// or the backend's own `NotFoundError` if it was deactivated in the
  /// instant between that check and the actual booking call.
  conflict,

  /// Any other failure (validation, transport, etc).
  error,
}

class PanchakarmaBookOutcome {
  const PanchakarmaBookOutcome(this.kind, {this.message, this.result});

  final PanchakarmaBookOutcomeKind kind;
  final String? message;

  /// Only set on [PanchakarmaBookOutcomeKind.success].
  final PanchakarmaBookingCreationResult? result;

  static const none = PanchakarmaBookOutcome(PanchakarmaBookOutcomeKind.none);
}

class PanchakarmaBookingState {
  const PanchakarmaBookingState({required this.sessionCount, this.submitting = false, this.outcome = PanchakarmaBookOutcome.none});

  final int sessionCount;
  final bool submitting;
  final PanchakarmaBookOutcome outcome;

  PanchakarmaBookingState copyWith({int? sessionCount, bool? submitting, PanchakarmaBookOutcome? outcome}) {
    return PanchakarmaBookingState(
      sessionCount: sessionCount ?? this.sessionCount,
      submitting: submitting ?? this.submitting,
      outcome: outcome ?? this.outcome,
    );
  }
}

/// Drives the session-count → book → payment-or-unavailable step of booking
/// a Panchakarma therapy (docs/mobile/IMPLEMENTATION-PLAN.md Phase 5),
/// structurally the same wizard shape as Phase 4's `BookingController` —
/// `StateNotifier`, not `AsyncNotifier`, for the same reason (a small set of
/// fine-grained sub-states, not one resource fetched once).
///
/// **Availability discipline, adapted from Phase 4's own rule** (brief §7):
/// there is no `/public/panchakarma/[id]` to re-fetch a single therapy from
/// (a real, reported gap — see `PanchakarmaTherapy`'s doc comment), so
/// [confirmBooking] re-verifies the therapy is still offered by re-running
/// the *real, existing* search endpoint (`q` + `city`, scoped tightly enough
/// to reliably include it) immediately before calling `/panchakarma-
/// bookings`, and refuses to book if that fresh search no longer contains
/// this exact centre+therapy pair — never trusts the object handed to this
/// screen via navigation `extra` as still accurate at the moment of
/// booking.
class PanchakarmaBookingFlowController extends StateNotifier<PanchakarmaBookingState> {
  PanchakarmaBookingFlowController(this._ref, this._therapy) : super(const PanchakarmaBookingState(sessionCount: 1));

  final Ref _ref;
  final PanchakarmaTherapy _therapy;

  void setSessionCount(int count) {
    if (count < 1 || count > 60) return;
    state = state.copyWith(sessionCount: count, outcome: PanchakarmaBookOutcome.none);
  }

  Future<void> confirmBooking() async {
    if (state.submitting) return;
    state = state.copyWith(submitting: true, outcome: PanchakarmaBookOutcome.none);
    final api = _ref.read(panchakarmaApiProvider);

    final fresh = await AsyncValue.guard(() => api.search(q: _therapy.name, city: _therapy.centreCity, limit: 50));
    if (fresh.hasError) {
      state = state.copyWith(
        submitting: false,
        outcome: const PanchakarmaBookOutcome(
          PanchakarmaBookOutcomeKind.error,
          message: "Couldn't confirm this therapy is still offered. Please try again.",
        ),
      );
      return;
    }

    final stillOffered = fresh.value!.therapies.any((t) => t.id == _therapy.id && t.centreId == _therapy.centreId);
    if (!stillOffered) {
      state = state.copyWith(
        submitting: false,
        outcome: const PanchakarmaBookOutcome(
          PanchakarmaBookOutcomeKind.conflict,
          message: 'This therapy is no longer available at this centre — please go back and search again.',
        ),
      );
      return;
    }

    try {
      final result = await api.book(centreId: _therapy.centreId, therapyId: _therapy.id, sessionCount: state.sessionCount);
      state = state.copyWith(submitting: false, outcome: PanchakarmaBookOutcome(PanchakarmaBookOutcomeKind.success, result: result));
    } on ApiException catch (e) {
      if (e.statusCode == 503) {
        state = state.copyWith(submitting: false, outcome: PanchakarmaBookOutcome(PanchakarmaBookOutcomeKind.serviceUnavailable, message: e.message));
        return;
      }
      if (e.statusCode == 404 || e.statusCode == 409) {
        state = state.copyWith(submitting: false, outcome: PanchakarmaBookOutcome(PanchakarmaBookOutcomeKind.conflict, message: e.message));
        return;
      }
      state = state.copyWith(submitting: false, outcome: PanchakarmaBookOutcome(PanchakarmaBookOutcomeKind.error, message: e.message));
    }
  }
}

final panchakarmaBookingFlowControllerProvider =
    StateNotifierProvider.family<PanchakarmaBookingFlowController, PanchakarmaBookingState, PanchakarmaTherapy>(
  (ref, therapy) => PanchakarmaBookingFlowController(ref, therapy),
);
