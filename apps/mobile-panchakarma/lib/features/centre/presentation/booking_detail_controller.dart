import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/centre_models.dart';
import 'dashboard_controller.dart';

class BookingDetailState {
  const BookingDetailState({required this.booking, required this.therapists});

  final CentreBooking booking;

  /// Active therapists only — the assignable set for a new session, same
  /// filter as the web booking page.
  final List<Therapist> therapists;
}

/// One booking's fulfilment workflow — the mobile counterpart of
/// apps/partner-web/.../bookings/[id]/booking-actions.tsx.
///
/// State machine (bookings.service.ts, exercised by the "centre
/// fulfilment" block of tests/integration/panchakarma.test.ts):
/// BOOKED --schedule--> SCHEDULED --attend (not last)--> IN_PROGRESS
/// --attend (last)--> COMPLETED; BOOKED/SCHEDULED --cancel--> CANCELLED.
///
/// Each action re-fetches the full booking afterwards (rather than patching
/// from the action's own thin response, which lacks `therapist.name`) and
/// refreshes the dashboard so its buckets stay in step. Client-side guards
/// ([CentreBooking.canScheduleMore], [CentreBooking.canMarkAttended]) mirror
/// the backend's own refusals; the backend remains the authority and its
/// message is surfaced if it still refuses.
class BookingDetailController extends AutoDisposeFamilyAsyncNotifier<BookingDetailState, String> {
  @override
  Future<BookingDetailState> build(String arg) => _load(arg);

  Future<BookingDetailState> _load(String bookingId) async {
    final api = ref.read(centreApiProvider);
    final results = await Future.wait([api.booking(bookingId), api.therapists()]);
    return BookingDetailState(
      booking: results[0] as CentreBooking,
      therapists: (results[1] as List<Therapist>).where((t) => t.active).toList(),
    );
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => _load(arg));
  }

  Future<String?> scheduleSession({required DateTime scheduledAt, String? therapistId}) async {
    final current = state.valueOrNull;
    if (current != null && !current.booking.canScheduleMore) {
      return 'All sessions for this booking have already been scheduled.';
    }
    return _act(() => ref.read(centreApiProvider).scheduleSession(arg, scheduledAt: scheduledAt, therapistId: therapistId));
  }

  Future<String?> markAttended(String sessionId, {String? notes, String? exceptionFlag}) async {
    final current = state.valueOrNull;
    if (current != null) {
      final session = current.booking.sessions.where((s) => s.id == sessionId).firstOrNull;
      if (session != null && session.isAttended) return 'This session is already marked attended.';
    }
    return _act(() => ref.read(centreApiProvider).markSessionAttended(sessionId, notes: notes, exceptionFlag: exceptionFlag));
  }

  Future<String?> cancel({String? reason}) {
    return _act(() => ref.read(centreApiProvider).cancelBooking(arg, reason: reason));
  }

  Future<String?> _act(Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (e) {
      return e.message;
    }
    await refresh();
    // Fire-and-forget: the dashboard's buckets depend on this booking.
    ref.invalidate(dashboardControllerProvider);
    return null;
  }
}

final bookingDetailControllerProvider =
    AsyncNotifierProvider.autoDispose.family<BookingDetailController, BookingDetailState, String>(BookingDetailController.new);
