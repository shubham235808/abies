import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/format.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/doctor_appointment.dart';
import '../domain/doctor_profile.dart';
import 'practice_providers.dart';

/// Home screen data: the doctor's profile (verification state) and, once
/// APPROVED, their appointments split the way the web overview
/// (apps/partner-web/src/app/partner/doctor/page.tsx) splits them.
class DashboardData {
  const DashboardData({required this.profile, required this.appointments, required this.now});

  final DoctorProfile profile;

  /// Empty unless [profile] is APPROVED — same as the web overview, which
  /// only loads appointments for an approved doctor.
  final List<DoctorAppointment> appointments;
  final DateTime now;

  /// Today's CONFIRMED/COMPLETED visits, earliest first.
  List<DoctorAppointment> get todaysSchedule => appointments
      .where((a) => (a.status == 'CONFIRMED' || a.status == 'COMPLETED') && isSameDay(a.scheduledAt, now))
      .toList()
    ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

  /// The first still-CONFIRMED visit today.
  DoctorAppointment? get nextPatient {
    for (final a in todaysSchedule) {
      if (a.status == 'CONFIRMED') return a;
    }
    return null;
  }

  /// CONFIRMED/PENDING_PAYMENT appointments from the start of today onward,
  /// soonest first — "upcoming consultations".
  List<DoctorAppointment> get upcoming {
    final startOfToday = DateTime(now.year, now.month, now.day);
    return appointments.where((a) => a.isUpcomingStatus && !a.scheduledAt.isBefore(startOfToday)).toList()
      ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
  }

  /// Everything else (past, completed, cancelled), most recent first.
  List<DoctorAppointment> get history {
    final upcomingIds = upcoming.map((a) => a.id).toSet();
    return appointments.where((a) => !upcomingIds.contains(a.id)).toList()..sort((a, b) => b.scheduledAt.compareTo(a.scheduledAt));
  }
}

/// Injectable clock so tests can pin "today".
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

class DashboardController extends AsyncNotifier<DashboardData> {
  @override
  Future<DashboardData> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('Dashboard read before sign-in');
    final api = ref.watch(doctorApiProvider);
    final profile = await api.me();
    final appointments = profile.isApproved ? await api.appointments() : const <DoctorAppointment>[];
    return DashboardData(profile: profile, appointments: appointments, now: ref.read(clockProvider)());
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final dashboardControllerProvider = AsyncNotifierProvider<DashboardController, DashboardData>(DashboardController.new);
