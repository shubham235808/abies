import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/appointment_hold.dart';
import '../domain/appointment_slot.dart';
import 'appointments_controller.dart';

/// Identifies one booking-flow instance: a doctor plus the consultation mode
/// it starts on. Equality/hashCode are by value so
/// `bookingControllerProvider(params)` resolves to the same instance across
/// rebuilds for the same doctor+starting-mode.
class BookingParams {
  const BookingParams({required this.doctorProfileId, required this.initialMode});

  final String doctorProfileId;
  final String initialMode;

  @override
  bool operator ==(Object other) =>
      other is BookingParams && other.doctorProfileId == doctorProfileId && other.initialMode == initialMode;

  @override
  int get hashCode => Object.hash(doctorProfileId, initialMode);
}

enum HoldOutcomeKind {
  /// Nothing attempted yet, or the user changed something since the last
  /// attempt (picking a slot clears a previous outcome).
  none,
  success,

  /// `holdSlot()`'s `ServiceUnavailableError` — Razorpay isn't configured in
  /// this environment (the expected state in dev right now, not a bug).
  /// Must be shown as a normal, calm, displayable state, never as a crash
  /// or a generic error (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4).
  serviceUnavailable,

  /// The chosen slot was taken by someone else — either caught by this
  /// controller's own re-fetch-before-hold check, or by the backend's own
  /// conditional-update race guard (`holdSlotRow()`'s `ConflictError`,
  /// `appointments.service.ts`) if two holds land at the same instant.
  conflict,

  /// Any other failure (validation, transport, etc).
  error,
}

class HoldOutcome {
  const HoldOutcome(this.kind, {this.message, this.hold});

  final HoldOutcomeKind kind;
  final String? message;

  /// Only set on [HoldOutcomeKind.success] — the real `/hold` response
  /// shape (`AppointmentHold`), not reachable in this dev environment (see
  /// that class's doc comment) but handled in full regardless.
  final AppointmentHold? hold;

  static const none = HoldOutcome(HoldOutcomeKind.none);
}

class BookingState {
  const BookingState({
    required this.mode,
    required this.slots,
    this.selectedSlot,
    this.careRecipientFamilyMemberId,
    this.reasonForVisit,
    this.submitting = false,
    this.holdOutcome = HoldOutcome.none,
  });

  /// "VIDEO" or "CLINIC" — whichever the user currently has selected; slots
  /// are reloaded whenever this changes.
  final String mode;
  final AsyncValue<List<AppointmentSlot>> slots;
  final AppointmentSlot? selectedSlot;
  final String? careRecipientFamilyMemberId;
  final String? reasonForVisit;

  /// True only while `confirmBooking()`'s re-fetch-then-hold sequence is in
  /// flight — distinct from `slots`'s own loading state, which covers the
  /// initial/mode-change slot list load.
  final bool submitting;
  final HoldOutcome holdOutcome;

  factory BookingState.initial(String mode) => BookingState(mode: mode, slots: const AsyncValue.loading());

  BookingState copyWith({
    String? mode,
    AsyncValue<List<AppointmentSlot>>? slots,
    AppointmentSlot? Function()? selectedSlot,
    String? Function()? careRecipientFamilyMemberId,
    String? Function()? reasonForVisit,
    bool? submitting,
    HoldOutcome? holdOutcome,
  }) {
    return BookingState(
      mode: mode ?? this.mode,
      slots: slots ?? this.slots,
      selectedSlot: selectedSlot != null ? selectedSlot() : this.selectedSlot,
      careRecipientFamilyMemberId:
          careRecipientFamilyMemberId != null ? careRecipientFamilyMemberId() : this.careRecipientFamilyMemberId,
      reasonForVisit: reasonForVisit != null ? reasonForVisit() : this.reasonForVisit,
      submitting: submitting ?? this.submitting,
      holdOutcome: holdOutcome ?? this.holdOutcome,
    );
  }
}

/// Drives the slot-selection → hold → payment-or-unavailable step of
/// booking (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4). Deliberately a
/// `StateNotifier`, not an `AsyncNotifier` — this is a multi-step wizard
/// with its own fine-grained sub-states (slots loading, a slot picked,
/// submitting, the hold outcome), not a single resource to fetch once.
///
/// **Availability discipline (brief §7, repeated in Phase 4's own exit
/// criteria)**: slots are only ever read fresh from the server. The initial
/// list loads once per [mode]; [confirmBooking] always re-fetches that same
/// list immediately before calling `/hold`, and refuses to hold a slot that
/// didn't come back in that fresh fetch — never trusts the UI's
/// already-rendered list as still accurate at the moment of booking.
class BookingController extends StateNotifier<BookingState> {
  BookingController(this._ref, this._params) : super(BookingState.initial(_params.initialMode)) {
    _loadSlots();
  }

  final Ref _ref;
  final BookingParams _params;

  Future<void> _loadSlots() async {
    state = state.copyWith(slots: const AsyncValue.loading());
    final result = await AsyncValue.guard(
      () => _ref.read(appointmentsApiProvider).slots(doctorProfileId: _params.doctorProfileId, mode: state.mode),
    );
    state = state.copyWith(slots: result);
  }

  Future<void> retrySlots() => _loadSlots();

  Future<void> changeMode(String mode) async {
    if (mode == state.mode) return;
    state = state.copyWith(
      mode: mode,
      selectedSlot: () => null,
      holdOutcome: HoldOutcome.none,
    );
    await _loadSlots();
  }

  void selectSlot(AppointmentSlot slot) {
    state = state.copyWith(selectedSlot: () => slot, holdOutcome: HoldOutcome.none);
  }

  void setFamilyMember(String? id) {
    state = state.copyWith(careRecipientFamilyMemberId: () => id);
  }

  void setReasonForVisit(String? reason) {
    state = state.copyWith(reasonForVisit: () => reason);
  }

  /// Formats a day-only ISO date (`YYYY-MM-DD`), matching `from`'s expected
  /// format in `listSlotsQuerySchema` (`appointments.schemas.ts`).
  String _dayOnly(DateTime dt) =>
      '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

  Future<void> confirmBooking() async {
    final slot = state.selectedSlot;
    if (slot == null || state.submitting) return;

    state = state.copyWith(submitting: true, holdOutcome: HoldOutcome.none);
    final api = _ref.read(appointmentsApiProvider);

    // Re-fetch right before holding — this call's whole point (see class
    // doc). Scoped to just the selected slot's own day since that's all we
    // need to confirm it's still there.
    final fresh = await AsyncValue.guard(
      () => api.slots(doctorProfileId: _params.doctorProfileId, mode: state.mode, from: _dayOnly(slot.startsAt), days: 1),
    );

    if (fresh.hasError) {
      state = state.copyWith(
        submitting: false,
        holdOutcome: const HoldOutcome(HoldOutcomeKind.error, message: "Couldn't confirm this slot is still available. Please try again."),
      );
      return;
    }

    final freshSlots = fresh.value!;
    if (!freshSlots.contains(slot)) {
      state = state.copyWith(
        slots: AsyncValue.data(freshSlots),
        selectedSlot: () => null,
        submitting: false,
        holdOutcome: const HoldOutcome(HoldOutcomeKind.conflict, message: 'This slot is no longer available — please pick another.'),
      );
      return;
    }

    try {
      final hold = await api.hold(
        doctorProfileId: _params.doctorProfileId,
        mode: state.mode,
        startsAt: slot.startsAt,
        careRecipientFamilyMemberId: state.careRecipientFamilyMemberId,
        reasonForVisit: state.reasonForVisit,
      );
      state = state.copyWith(submitting: false, holdOutcome: HoldOutcome(HoldOutcomeKind.success, hold: hold));
    } on ApiException catch (e) {
      if (e.statusCode == 503) {
        state = state.copyWith(
          submitting: false,
          holdOutcome: HoldOutcome(HoldOutcomeKind.serviceUnavailable, message: e.message),
        );
        return;
      }
      if (e.statusCode == 409) {
        state = state.copyWith(submitting: false, holdOutcome: HoldOutcome(HoldOutcomeKind.conflict, message: e.message));
        await _loadSlots();
        return;
      }
      state = state.copyWith(submitting: false, holdOutcome: HoldOutcome(HoldOutcomeKind.error, message: e.message));
    }
  }
}

final bookingControllerProvider = StateNotifierProvider.family<BookingController, BookingState, BookingParams>(
  (ref, params) => BookingController(ref, params),
);
