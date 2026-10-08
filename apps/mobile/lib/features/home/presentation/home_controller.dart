import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../profile/presentation/profile_controller.dart';
import '../data/home_api.dart';
import '../domain/appointment_summary.dart';
import '../domain/diagnostic_order_summary.dart';
import '../domain/diagnostic_preview.dart';
import '../domain/doctor_preview.dart';
import '../domain/medicine_order_summary.dart';
import '../domain/medicine_preview.dart';
import '../domain/panchakarma_booking_summary.dart';
import '../domain/panchakarma_preview.dart';

final homeApiProvider = Provider<HomeApi>((ref) => HomeApiImpl(ref.watch(apiClientProvider)));

/// How many preview items each horizontal catalogue row asks the backend
/// for. The public search routes all support `limit` up to 50
/// (`doctors.schemas.ts`/`catalogue.schemas.ts`'s public search schemas) —
/// this just keeps the home screen light.
const int homePreviewLimit = 8;

/// One `AsyncValue` per dashboard section, so a failure loading one section
/// (e.g. the medicines catalogue is down) never blanks out the sections that
/// loaded fine (docs/mobile/IMPLEMENTATION-PLAN.md Phase 3's "graceful
/// empty/offline/skeleton states for each section" exit criterion). Each
/// field already carries its own loading/data/error per `AsyncValue`, which
/// the screen renders with `state_views.dart`.
class HomeData {
  const HomeData({
    required this.city,
    required this.isSignedIn,
    required this.appointments,
    required this.medicineOrders,
    required this.diagnosticOrders,
    required this.panchakarmaBookings,
    required this.doctors,
    required this.panchakarma,
    required this.diagnostics,
    required this.medicines,
  });

  /// The location signal used for the catalogue previews below — the
  /// signed-in patient's own `PatientProfile.city`, or null if they haven't
  /// set one (in which case the previews below are unfiltered, not empty)
  /// — also null for a signed-out visitor, who has no profile to read one
  /// from at all.
  final String? city;

  /// False for a signed-out visitor browsing the public catalogue (brief:
  /// "must NOT show login on first launch"). [appointments]/
  /// [medicineOrders]/[diagnosticOrders]/[panchakarmaBookings] are never
  /// even attempted in that case — this is how `HomeScreen` decides whether
  /// to render those four personal sections at all, rather than a "no
  /// bookings yet" empty state that would wrongly imply an account exists.
  final bool isSignedIn;

  final AsyncValue<List<AppointmentSummary>> appointments;
  final AsyncValue<List<MedicineOrderSummary>> medicineOrders;
  final AsyncValue<List<DiagnosticOrderSummary>> diagnosticOrders;
  final AsyncValue<List<PanchakarmaBookingSummary>> panchakarmaBookings;
  final AsyncValue<List<DoctorPreview>> doctors;
  final AsyncValue<List<PanchakarmaPreview>> panchakarma;
  final AsyncValue<List<DiagnosticPreview>> diagnostics;
  final AsyncValue<List<MedicinePreview>> medicines;

  /// Upcoming = in the future and not cancelled (Phase 3's own definition),
  /// soonest first. The raw list from the backend is newest-scheduled-first
  /// (`appointments.service.ts`'s `orderBy: { scheduledAt: 'desc' }`), which
  /// is the wrong order for "what's next".
  AsyncValue<List<AppointmentSummary>> get upcomingAppointments => appointments.whenData((all) {
        final upcoming = all.where((a) => a.isUpcoming).toList();
        upcoming.sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
        return upcoming;
      });

  AsyncValue<List<MedicineOrderSummary>> get activeMedicineOrders =>
      medicineOrders.whenData((all) => all.where((o) => o.isActive).toList());

  AsyncValue<List<DiagnosticOrderSummary>> get activeDiagnosticOrders =>
      diagnosticOrders.whenData((all) => all.where((o) => o.isActive).toList());

  AsyncValue<List<PanchakarmaBookingSummary>> get activePanchakarmaBookings =>
      panchakarmaBookings.whenData((all) => all.where((b) => b.isActive).toList());

  HomeData copyWith({
    AsyncValue<List<AppointmentSummary>>? appointments,
    AsyncValue<List<MedicineOrderSummary>>? medicineOrders,
    AsyncValue<List<DiagnosticOrderSummary>>? diagnosticOrders,
    AsyncValue<List<PanchakarmaBookingSummary>>? panchakarmaBookings,
    AsyncValue<List<DoctorPreview>>? doctors,
    AsyncValue<List<PanchakarmaPreview>>? panchakarma,
    AsyncValue<List<DiagnosticPreview>>? diagnostics,
    AsyncValue<List<MedicinePreview>>? medicines,
  }) {
    return HomeData(
      city: city,
      isSignedIn: isSignedIn,
      appointments: appointments ?? this.appointments,
      medicineOrders: medicineOrders ?? this.medicineOrders,
      diagnosticOrders: diagnosticOrders ?? this.diagnosticOrders,
      panchakarmaBookings: panchakarmaBookings ?? this.panchakarmaBookings,
      doctors: doctors ?? this.doctors,
      panchakarma: panchakarma ?? this.panchakarma,
      diagnostics: diagnostics ?? this.diagnostics,
      medicines: medicines ?? this.medicines,
    );
  }
}

/// Loads the home dashboard (docs/mobile/IMPLEMENTATION-PLAN.md Phase 3).
///
/// **Browsable signed out** (brief: "must NOT show login on first
/// launch... must allow a customer to browse... without being forced to
/// authenticate"): a signed-out visitor gets the same four public
/// catalogue preview rows as a signed-in patient, just none of the
/// `/mine`-shaped personal sections (appointments/orders/bookings) — those
/// are never even attempted, not fetched-then-hidden, the same way
/// [ProfileController] never fetches before there's a session. Only once
/// signed in does this also read the patient's own `PatientProfile.city`
/// (Phase 2) as the previews' location signal.
///
/// **Location, deliberately**: this uses the signed-in patient's own
/// `PatientProfile.city` and nothing else — never device geolocation/GPS
/// permission (see apps/mobile/README.md "What Phase 3 added" and
/// docs/mobile/IMPLEMENTATION-PLAN.md's Phase 3 entry for the reasoning). A
/// patient with no city set, or a signed-out visitor with no profile at
/// all, simply gets the unfiltered catalogue.
class HomeController extends AsyncNotifier<HomeData> {
  @override
  Future<HomeData> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      return _load(null, isSignedIn: false);
    }
    final profile = await ref.watch(profileControllerProvider.future);
    return _load(profile.profile.city, isSignedIn: true);
  }

  Future<HomeData> _load(String? city, {required bool isSignedIn}) async {
    final api = ref.read(homeApiProvider);
    final appointments = isSignedIn ? await AsyncValue.guard(api.myAppointments) : const AsyncValue.data(<AppointmentSummary>[]);
    final medicineOrders = isSignedIn ? await AsyncValue.guard(api.myMedicineOrders) : const AsyncValue.data(<MedicineOrderSummary>[]);
    final diagnosticOrders =
        isSignedIn ? await AsyncValue.guard(api.myDiagnosticOrders) : const AsyncValue.data(<DiagnosticOrderSummary>[]);
    final panchakarmaBookings =
        isSignedIn ? await AsyncValue.guard(api.myPanchakarmaBookings) : const AsyncValue.data(<PanchakarmaBookingSummary>[]);
    final doctors = await AsyncValue.guard(() => api.previewDoctors(city: city, limit: homePreviewLimit));
    final panchakarma = await AsyncValue.guard(() => api.previewPanchakarma(city: city, limit: homePreviewLimit));
    final diagnostics = await AsyncValue.guard(() => api.previewDiagnostics(city: city, limit: homePreviewLimit));
    final medicines = await AsyncValue.guard(() => api.previewMedicines(area: city, limit: homePreviewLimit));
    return HomeData(
      city: city,
      isSignedIn: isSignedIn,
      appointments: appointments,
      medicineOrders: medicineOrders,
      diagnosticOrders: diagnosticOrders,
      panchakarmaBookings: panchakarmaBookings,
      doctors: doctors,
      panchakarma: panchakarma,
      diagnostics: diagnostics,
      medicines: medicines,
    );
  }

  /// Per-section retry so one failed card (e.g. "couldn't load doctors
  /// nearby") doesn't force reloading everything else that already loaded
  /// fine.
  Future<void> retryAppointments() => _retrySection((api, city) => AsyncValue.guard(api.myAppointments),
      (data, value) => data.copyWith(appointments: value));

  Future<void> retryMedicineOrders() => _retrySection((api, city) => AsyncValue.guard(api.myMedicineOrders),
      (data, value) => data.copyWith(medicineOrders: value));

  Future<void> retryDiagnosticOrders() => _retrySection((api, city) => AsyncValue.guard(api.myDiagnosticOrders),
      (data, value) => data.copyWith(diagnosticOrders: value));

  Future<void> retryPanchakarmaBookings() => _retrySection((api, city) => AsyncValue.guard(api.myPanchakarmaBookings),
      (data, value) => data.copyWith(panchakarmaBookings: value));

  Future<void> retryDoctors() => _retrySection(
      (api, city) => AsyncValue.guard(() => api.previewDoctors(city: city, limit: homePreviewLimit)),
      (data, value) => data.copyWith(doctors: value));

  Future<void> retryPanchakarma() => _retrySection(
      (api, city) => AsyncValue.guard(() => api.previewPanchakarma(city: city, limit: homePreviewLimit)),
      (data, value) => data.copyWith(panchakarma: value));

  Future<void> retryDiagnostics() => _retrySection(
      (api, city) => AsyncValue.guard(() => api.previewDiagnostics(city: city, limit: homePreviewLimit)),
      (data, value) => data.copyWith(diagnostics: value));

  Future<void> retryMedicines() => _retrySection(
      (api, city) => AsyncValue.guard(() => api.previewMedicines(area: city, limit: homePreviewLimit)),
      (data, value) => data.copyWith(medicines: value));

  Future<void> _retrySection<T>(
    Future<AsyncValue<T>> Function(HomeApi api, String? city) fetch,
    HomeData Function(HomeData data, AsyncValue<T> value) apply,
  ) async {
    final current = state.value;
    if (current == null) return;
    final value = await fetch(ref.read(homeApiProvider), current.city);
    final latest = state.value;
    if (latest == null) return;
    state = AsyncValue.data(apply(latest, value));
  }
}

final homeControllerProvider = AsyncNotifierProvider<HomeController, HomeData>(HomeController.new);
