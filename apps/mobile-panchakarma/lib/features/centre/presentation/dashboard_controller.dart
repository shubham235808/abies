import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/centre_api.dart';
import '../domain/centre_models.dart';

final centreApiProvider = Provider<CentreApi>((ref) => CentreApiImpl(ref.watch(apiClientProvider)));

class SessionEntry {
  const SessionEntry({required this.booking, required this.session});

  final CentreBooking booking;
  final CentreSession session;
}

/// The centre's overview: profile + paid bookings, bucketed exactly the way
/// the partner web dashboard does it
/// (apps/partner-web/src/app/partner/panchakarma-centre/page.tsx) — every
/// bucket derived from existing booking/session fields, no extra query.
class CentreDashboard {
  CentreDashboard({required this.centre, required this.bookings, DateTime? now}) : _now = now ?? DateTime.now();

  final CentreProfile centre;
  final List<CentreBooking> bookings;
  final DateTime _now;

  static bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  List<SessionEntry> get todaysSessions => [
        for (final b in bookings)
          for (final s in b.sessions)
            if (!s.isAttended && b.isActive && _sameDay(s.scheduledAt, _now)) SessionEntry(booking: b, session: s),
      ]..sort((x, y) => x.session.scheduledAt.compareTo(y.session.scheduledAt));

  List<SessionEntry> get upcomingSessions => [
        for (final b in bookings)
          for (final s in b.sessions)
            if (!s.isAttended && b.isActive && s.scheduledAt.isAfter(_now) && !_sameDay(s.scheduledAt, _now))
              SessionEntry(booking: b, session: s),
      ]..sort((x, y) => x.session.scheduledAt.compareTo(y.session.scheduledAt));

  /// Active bookings with fewer sessions scheduled than booked.
  List<CentreBooking> get awaitingScheduling => bookings.where((b) => b.canScheduleMore).toList();

  List<CentreBooking> get activeCourses =>
      bookings.where((b) => b.status == BookingStatus.scheduled || b.status == BookingStatus.inProgress).toList();

  List<CentreBooking> get completed => bookings.where((b) => b.status == BookingStatus.completed).toList();

  /// Paid and still in fulfilment (BOOKED/SCHEDULED/IN_PROGRESS).
  List<CentreBooking> get activeBookings => bookings.where((b) => b.isActive).toList();
}

class DashboardController extends AsyncNotifier<CentreDashboard> {
  @override
  Future<CentreDashboard> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('DashboardController read before sign-in');
    return _load();
  }

  Future<CentreDashboard> _load() async {
    final api = ref.read(centreApiProvider);
    final centre = await api.myCentre();
    // Same as the web overview: only an APPROVED centre has a bookings view
    // (an unapproved one can't be booked — bookTherapy requires APPROVED).
    final bookings = centre.isApproved ? await api.bookings() : const <CentreBooking>[];
    return CentreDashboard(centre: centre, bookings: bookings);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_load);
  }

  /// `PATCH /panchakarma-centres/me`. Returns null on success, else the
  /// user-facing message (state untouched).
  Future<String?> updateProfile(CentreProfileInput input) async {
    try {
      await ref.read(centreApiProvider).updateMyCentre(input);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// `POST /panchakarma-centres/me/submit` — the backend lists any missing
  /// fields in its error message (centres.service.ts `submitCentre`).
  Future<String?> submitApplication() async {
    try {
      await ref.read(centreApiProvider).submitApplication(declarationAccepted: true);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final dashboardControllerProvider = AsyncNotifierProvider<DashboardController, CentreDashboard>(DashboardController.new);
