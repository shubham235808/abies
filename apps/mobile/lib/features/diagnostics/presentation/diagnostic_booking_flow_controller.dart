import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../data/diagnostics_api.dart';
import '../domain/diagnostic_booking_args.dart';
import '../domain/diagnostic_booking_creation.dart';
import '../domain/diagnostic_booking_target.dart';
import 'diagnostics_search_controller.dart';

enum DiagnosticBookOutcomeKind {
  /// Nothing attempted yet, or the user changed a field since the last
  /// attempt.
  none,
  success,

  /// `bookOrder()`'s `ServiceUnavailableError` — Razorpay isn't configured in
  /// this environment (the expected state in dev right now, not a bug).
  serviceUnavailable,

  /// The test/package is no longer offered at this lab — either this
  /// controller's own re-fetch-before-booking check didn't find it anymore,
  /// or the backend's own error if it was deactivated in the instant between
  /// that check and the actual booking call.
  conflict,

  /// A client-side validation failure caught *before* calling the backend
  /// (missing scheduled time, or a home-collection address when required) —
  /// enforced here so an invalid request is never even sent, not just relied
  /// on the backend's own 400.
  validationError,

  /// Any other failure (transport, unexpected server error, etc).
  error,
}

class DiagnosticBookOutcome {
  const DiagnosticBookOutcome(this.kind, {this.message, this.result});

  final DiagnosticBookOutcomeKind kind;
  final String? message;

  /// Only set on [DiagnosticBookOutcomeKind.success].
  final DiagnosticBookingCreationResult? result;

  static const none = DiagnosticBookOutcome(DiagnosticBookOutcomeKind.none);
}

class DiagnosticBookingState {
  const DiagnosticBookingState({
    this.collectionMode = 'LAB_VISIT',
    this.scheduledAt,
    this.address = '',
    this.submitting = false,
    this.outcome = DiagnosticBookOutcome.none,
  });

  /// `DiagnosticCollectionMode`: HOME or LAB_VISIT.
  final String collectionMode;
  final DateTime? scheduledAt;
  final String address;
  final bool submitting;
  final DiagnosticBookOutcome outcome;

  DiagnosticBookingState copyWith({
    String? collectionMode,
    DateTime? Function()? scheduledAt,
    String? address,
    bool? submitting,
    DiagnosticBookOutcome? outcome,
  }) {
    return DiagnosticBookingState(
      collectionMode: collectionMode ?? this.collectionMode,
      scheduledAt: scheduledAt != null ? scheduledAt() : this.scheduledAt,
      address: address ?? this.address,
      submitting: submitting ?? this.submitting,
      outcome: outcome ?? this.outcome,
    );
  }
}

/// Drives the collection-mode/schedule → book → payment-or-unavailable step
/// of booking a diagnostic test or package (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 6) — structurally the same wizard shape as
/// Phase 4/5's booking controllers.
///
/// **testIds XOR packageId, enforced twice**: once at the type level by
/// [DiagnosticBookingTarget] (there is no way to construct one with both),
/// and again here by never calling `DiagnosticsApi.book` with anything but
/// exactly the one the target carries — this controller never reads a raw
/// "both fields open" form.
///
/// **Availability discipline, adapted from Phase 4/5's own rule** (brief
/// §7): there is no `/public/diagnostics/[id]` to re-fetch a single
/// test/package from (a real, reported gap — see `DiagnosticTestSummary`'s
/// doc comment), so [confirmBooking] re-verifies every test (or the package)
/// in the target is still offered by re-running the *real, existing* search
/// endpoint by name immediately before calling `/diagnostic-orders`, and
/// refuses to book if any of them is missing from that fresh search — never
/// trusts the object(s) handed to this screen via navigation `extra` as
/// still accurate at the moment of booking. For a multi-test target this
/// means one re-fetch per distinct test name (bounded by `testIds`' own
/// max of 10), same spirit as Phase 5's single re-fetch, just looped.
class DiagnosticBookingFlowController extends StateNotifier<DiagnosticBookingState> {
  DiagnosticBookingFlowController(this._ref, this._args) : super(const DiagnosticBookingState());

  final Ref _ref;
  final DiagnosticBookingArgs _args;

  // One key per distinct booking request (docs/mobile/IMPLEMENTATION-PLAN.md
  // Phase 8) — reused across confirmBooking()'s own retries, regenerated
  // whenever mode/time/address actually change (a different request, not a
  // retry of the same one).
  String _idempotencyKey = ApiClient.newIdempotencyKey();

  DiagnosticBookingTarget get target => _args.target;

  void setCollectionMode(String mode) {
    if (mode != 'HOME' && mode != 'LAB_VISIT') return;
    if (mode == 'HOME' && !target.homeCollectionSupported) return;
    if (mode == state.collectionMode) return;
    _idempotencyKey = ApiClient.newIdempotencyKey();
    state = state.copyWith(collectionMode: mode, outcome: DiagnosticBookOutcome.none);
  }

  void setScheduledAt(DateTime dateTime) {
    if (dateTime == state.scheduledAt) return;
    _idempotencyKey = ApiClient.newIdempotencyKey();
    state = state.copyWith(scheduledAt: () => dateTime, outcome: DiagnosticBookOutcome.none);
  }

  void setAddress(String address) {
    if (address == state.address) return;
    _idempotencyKey = ApiClient.newIdempotencyKey();
    state = state.copyWith(address: address, outcome: DiagnosticBookOutcome.none);
  }

  Future<void> confirmBooking() async {
    if (state.submitting) return;

    final scheduledAt = state.scheduledAt;
    if (scheduledAt == null) {
      state = state.copyWith(
        outcome: const DiagnosticBookOutcome(DiagnosticBookOutcomeKind.validationError, message: 'Please choose a date and time.'),
      );
      return;
    }
    if (scheduledAt.isBefore(DateTime.now())) {
      state = state.copyWith(
        outcome: const DiagnosticBookOutcome(DiagnosticBookOutcomeKind.validationError, message: 'Please choose a time in the future.'),
      );
      return;
    }
    if (state.collectionMode == 'HOME' && state.address.trim().isEmpty) {
      state = state.copyWith(
        outcome: const DiagnosticBookOutcome(
          DiagnosticBookOutcomeKind.validationError,
          message: 'Please enter an address for home sample collection.',
        ),
      );
      return;
    }

    state = state.copyWith(submitting: true, outcome: DiagnosticBookOutcome.none);
    final api = _ref.read(diagnosticsApiProvider);

    final stillOffered = await _verifyStillOffered(api);
    if (stillOffered == null) {
      state = state.copyWith(
        submitting: false,
        outcome: const DiagnosticBookOutcome(
          DiagnosticBookOutcomeKind.error,
          message: "Couldn't confirm this is still offered. Please try again.",
        ),
      );
      return;
    }
    if (!stillOffered) {
      state = state.copyWith(
        submitting: false,
        outcome: const DiagnosticBookOutcome(
          DiagnosticBookOutcomeKind.conflict,
          message: 'This is no longer available at this lab — please go back and search again.',
        ),
      );
      return;
    }

    try {
      final result = await api.book(
        labId: target.labId,
        testIds: target.testIds,
        packageId: target.packageId,
        recommendationId: _args.recommendationId,
        collectionMode: state.collectionMode,
        scheduledAt: scheduledAt.toUtc().toIso8601String(),
        address: state.collectionMode == 'HOME' ? state.address.trim() : null,
        idempotencyKey: _idempotencyKey,
      );
      state = state.copyWith(submitting: false, outcome: DiagnosticBookOutcome(DiagnosticBookOutcomeKind.success, result: result));
    } on ApiException catch (e) {
      if (e.statusCode == 503) {
        state = state.copyWith(submitting: false, outcome: DiagnosticBookOutcome(DiagnosticBookOutcomeKind.serviceUnavailable, message: e.message));
        return;
      }
      if (e.statusCode == 404 || e.statusCode == 409 || e.statusCode == 400) {
        state = state.copyWith(submitting: false, outcome: DiagnosticBookOutcome(DiagnosticBookOutcomeKind.conflict, message: e.message));
        return;
      }
      state = state.copyWith(submitting: false, outcome: DiagnosticBookOutcome(DiagnosticBookOutcomeKind.error, message: e.message));
    }
  }

  /// Returns true/false once resolved, or null if the re-verification calls
  /// themselves failed (transport error) — distinguished from "not offered"
  /// so the UI never reports a false conflict for a plain network blip.
  Future<bool?> _verifyStillOffered(DiagnosticsApi api) async {
    if (target.kind == DiagnosticBookingKind.package) {
      final pkg = target.package!;
      final fresh = await AsyncValue.guard(() => api.searchPackages(q: pkg.name, limit: 50));
      if (fresh.hasError) return null;
      return fresh.value!.packages.any((p) => p.id == pkg.id && p.labId == pkg.labId);
    }
    for (final test in target.tests) {
      final fresh = await AsyncValue.guard(() => api.searchTests(q: test.name, limit: 50));
      if (fresh.hasError) return null;
      final found = fresh.value!.tests.any((t) => t.id == test.id && t.labId == test.labId);
      if (!found) return false;
    }
    return true;
  }
}

final diagnosticBookingFlowControllerProvider =
    StateNotifierProvider.family<DiagnosticBookingFlowController, DiagnosticBookingState, DiagnosticBookingArgs>(
  (ref, args) => DiagnosticBookingFlowController(ref, args),
);
