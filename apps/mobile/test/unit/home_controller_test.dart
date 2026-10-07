import 'dart:async';

import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile/features/home/data/home_api.dart';
import 'package:abies_mobile/features/home/domain/appointment_summary.dart';
import 'package:abies_mobile/features/home/domain/diagnostic_order_summary.dart';
import 'package:abies_mobile/features/home/domain/diagnostic_preview.dart';
import 'package:abies_mobile/features/home/domain/doctor_preview.dart';
import 'package:abies_mobile/features/home/domain/medicine_order_summary.dart';
import 'package:abies_mobile/features/home/domain/medicine_preview.dart';
import 'package:abies_mobile/features/home/domain/panchakarma_booking_summary.dart';
import 'package:abies_mobile/features/home/domain/panchakarma_preview.dart';
import 'package:abies_mobile/features/home/presentation/home_controller.dart';
import 'package:abies_mobile/features/profile/data/consent_api.dart';
import 'package:abies_mobile/features/profile/data/profile_api.dart';
import 'package:abies_mobile/features/profile/domain/consent.dart';
import 'package:abies_mobile/features/profile/domain/family_member.dart';
import 'package:abies_mobile/features/profile/domain/patient_profile.dart';
import 'package:abies_mobile/features/profile/presentation/profile_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const testUser = SessionUser(id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'PATIENT');

class FakeAuthApi implements AuthApi {
  SessionUser? meResult = testUser;
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();

  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;
  @override
  Future<SessionUser?> me() async => meResult;
  @override
  Future<void> logout() async => meResult = null;
  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email}) => throw UnimplementedError('not used in these tests');
  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) =>
      throw UnimplementedError('not used in these tests');
}

/// Only `city` varies across tests — everything else is a fixed, bare
/// profile, mirroring the "bare profile" shape `patient_profile_test.dart`
/// already exercises for `MyProfile.fromJson`.
class FakeProfileApi implements ProfileApi {
  FakeProfileApi({this.city});

  final String? city;

  @override
  Future<MyProfile> getMyProfile() async {
    return MyProfile(
      profile: PatientProfile(
        firstName: 'Asha',
        lastName: 'Rao',
        dateOfBirth: null,
        gender: null,
        phone: null,
        address: null,
        city: city,
        state: null,
        pin: null,
        preferredLanguage: 'English',
        emergencyContact: null,
        allergies: const [],
        medicalHistory: null,
        familyMembers: const [],
      ),
      email: 'asha@example.test',
      mobile: '+919876543210',
    );
  }

  @override
  Future<PatientProfile> updateMyProfile(Map<String, dynamic> patch) => throw UnimplementedError('not used in these tests');
  @override
  Future<FamilyMember> addFamilyMember(Map<String, dynamic> dto) => throw UnimplementedError('not used in these tests');
  @override
  Future<FamilyMember> updateFamilyMember(String id, Map<String, dynamic> dto) => throw UnimplementedError('not used in these tests');
  @override
  Future<void> deleteFamilyMember(String id) => throw UnimplementedError('not used in these tests');
}

class FakeConsentApi implements ConsentApi {
  @override
  Future<List<ConsentArtifact>> listCurrentArtifacts() async => const [];
  @override
  Future<List<ConsentRecord>> listMyConsents() async => const [];
  @override
  Future<ConsentRecord> accept(String artifactId) => throw UnimplementedError('not used in these tests');
  @override
  Future<ConsentRecord> withdraw(String artifactId) => throw UnimplementedError('not used in these tests');
}

class FakeHomeApi implements HomeApi {
  List<AppointmentSummary> appointments = const [];
  List<MedicineOrderSummary> medicineOrders = const [];
  List<DiagnosticOrderSummary> diagnosticOrders = const [];
  List<PanchakarmaBookingSummary> panchakarmaBookings = const [];
  List<DoctorPreview> doctors = const [];
  List<PanchakarmaPreview> panchakarma = const [];
  List<DiagnosticPreview> diagnostics = const [];
  List<MedicinePreview> medicines = const [];

  /// Set any of these to make that call fail, to test that one section's
  /// failure doesn't take down the others.
  Object? medicineOrdersError;

  String? lastDoctorsCity = 'unset';
  String? lastPanchakarmaCity = 'unset';
  String? lastDiagnosticsCity = 'unset';
  String? lastMedicinesArea = 'unset';

  @override
  Future<List<AppointmentSummary>> myAppointments() async => appointments;

  @override
  Future<List<MedicineOrderSummary>> myMedicineOrders() async {
    if (medicineOrdersError != null) throw medicineOrdersError!;
    return medicineOrders;
  }

  @override
  Future<List<DiagnosticOrderSummary>> myDiagnosticOrders() async => diagnosticOrders;

  @override
  Future<List<PanchakarmaBookingSummary>> myPanchakarmaBookings() async => panchakarmaBookings;

  @override
  Future<List<DoctorPreview>> previewDoctors({String? city, int limit = 8}) async {
    lastDoctorsCity = city;
    return doctors;
  }

  @override
  Future<List<PanchakarmaPreview>> previewPanchakarma({String? city, int limit = 8}) async {
    lastPanchakarmaCity = city;
    return panchakarma;
  }

  @override
  Future<List<DiagnosticPreview>> previewDiagnostics({String? city, int limit = 8}) async {
    lastDiagnosticsCity = city;
    return diagnostics;
  }

  @override
  Future<List<MedicinePreview>> previewMedicines({String? area, int limit = 8}) async {
    lastMedicinesArea = area;
    return medicines;
  }
}

AppointmentSummary _appointment({required String id, required String status, required DateTime scheduledAt}) {
  return AppointmentSummary(
    id: id,
    scheduledAt: scheduledAt,
    status: status,
    mode: 'VIDEO',
    doctorName: 'Dr. Asha Rao',
    clinicName: null,
    familyMemberName: null,
  );
}

MedicineOrderSummary _medicineOrder({required String id, required String status}) {
  return MedicineOrderSummary(id: id, status: status, createdAt: DateTime.now(), pharmacyName: 'ABIES Pharmacy', itemCount: 2);
}

DiagnosticOrderSummary _diagnosticOrder({required String id, required String status}) {
  return DiagnosticOrderSummary(id: id, status: status, createdAt: DateTime.now(), labName: 'City Lab', itemCount: 1);
}

PanchakarmaBookingSummary _panchakarmaBooking({required String id, required String status}) {
  return PanchakarmaBookingSummary(
    id: id,
    status: status,
    createdAt: DateTime.now(),
    centreName: 'Serenity Centre',
    therapyName: 'Abhyanga',
    sessionCount: 3,
  );
}

ProviderContainer _buildContainer({required FakeHomeApi home, String? city}) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(FakeAuthApi()),
    profileApiProvider.overrideWithValue(FakeProfileApi(city: city)),
    consentApiProvider.overrideWithValue(FakeConsentApi()),
    homeApiProvider.overrideWithValue(home),
  ]);
  return container;
}

void main() {
  group('HomeController', () {
    test('filters appointments to upcoming (future, non-cancelled), soonest first', () async {
      final now = DateTime.now();
      final home = FakeHomeApi()
        ..appointments = [
          _appointment(id: 'past', status: 'COMPLETED', scheduledAt: now.subtract(const Duration(days: 1))),
          _appointment(id: 'future-cancelled', status: 'CANCELLED', scheduledAt: now.add(const Duration(days: 2))),
          _appointment(id: 'future-far', status: 'CONFIRMED', scheduledAt: now.add(const Duration(days: 5))),
          _appointment(id: 'future-near', status: 'CONFIRMED', scheduledAt: now.add(const Duration(days: 1))),
        ];
      final container = _buildContainer(home: home, city: 'Pune');
      addTearDown(container.dispose);

      final data = await container.read(homeControllerProvider.future);
      final upcoming = data.upcomingAppointments.value!;

      expect(upcoming.map((a) => a.id).toList(), ['future-near', 'future-far']);
    });

    test('filters medicine orders to active (not delivered, not cancelled)', () async {
      final home = FakeHomeApi()
        ..medicineOrders = [
          _medicineOrder(id: 'pending', status: 'PENDING'),
          _medicineOrder(id: 'dispatched', status: 'DISPATCHED'),
          _medicineOrder(id: 'delivered', status: 'DELIVERED'),
          _medicineOrder(id: 'cancelled', status: 'CANCELLED'),
        ];
      final container = _buildContainer(home: home, city: 'Pune');
      addTearDown(container.dispose);

      final data = await container.read(homeControllerProvider.future);
      final active = data.activeMedicineOrders.value!;

      expect(active.map((o) => o.id).toSet(), {'pending', 'dispatched'});
    });

    test('filters diagnostic orders to active (not completed, not cancelled)', () async {
      final home = FakeHomeApi()
        ..diagnosticOrders = [
          _diagnosticOrder(id: 'booked', status: 'BOOKED'),
          _diagnosticOrder(id: 'completed', status: 'COMPLETED'),
          _diagnosticOrder(id: 'cancelled', status: 'CANCELLED'),
        ];
      final container = _buildContainer(home: home, city: 'Pune');
      addTearDown(container.dispose);

      final data = await container.read(homeControllerProvider.future);
      final active = data.activeDiagnosticOrders.value!;

      expect(active.map((o) => o.id).toSet(), {'booked'});
    });

    test('filters Panchakarma bookings to active (not completed, not cancelled)', () async {
      final home = FakeHomeApi()
        ..panchakarmaBookings = [
          _panchakarmaBooking(id: 'scheduled', status: 'SCHEDULED'),
          _panchakarmaBooking(id: 'completed', status: 'COMPLETED'),
          _panchakarmaBooking(id: 'cancelled', status: 'CANCELLED'),
        ];
      final container = _buildContainer(home: home, city: 'Pune');
      addTearDown(container.dispose);

      final data = await container.read(homeControllerProvider.future);
      final active = data.activePanchakarmaBookings.value!;

      expect(active.map((b) => b.id).toSet(), {'scheduled'});
    });

    test("passes the patient's profile city as the location signal to doctors/panchakarma/diagnostics (city) and medicines (area)", () async {
      final home = FakeHomeApi();
      final container = _buildContainer(home: home, city: 'Pune');
      addTearDown(container.dispose);

      await container.read(homeControllerProvider.future);

      expect(home.lastDoctorsCity, 'Pune');
      expect(home.lastPanchakarmaCity, 'Pune');
      expect(home.lastDiagnosticsCity, 'Pune');
      expect(home.lastMedicinesArea, 'Pune');
    });

    test('falls back to no location filter when the profile has no city set (never asks the device for location)', () async {
      final home = FakeHomeApi();
      final container = _buildContainer(home: home, city: null);
      addTearDown(container.dispose);

      final data = await container.read(homeControllerProvider.future);

      expect(data.city, isNull);
      expect(home.lastDoctorsCity, isNull);
      expect(home.lastMedicinesArea, isNull);
    });

    test('one section failing (medicine orders) leaves every other section loaded', () async {
      final home = FakeHomeApi()
        ..medicineOrdersError = Exception('pharmacy service unavailable')
        ..appointments = [_appointment(id: 'a1', status: 'CONFIRMED', scheduledAt: DateTime.now().add(const Duration(days: 1)))];
      final container = _buildContainer(home: home, city: 'Pune');
      addTearDown(container.dispose);

      final data = await container.read(homeControllerProvider.future);

      expect(data.medicineOrders.hasError, isTrue);
      expect(data.appointments.hasValue, isTrue);
      expect(data.doctors.hasValue, isTrue);
    });

    test('retryMedicineOrders re-fetches only that section and clears its error', () async {
      final home = FakeHomeApi()..medicineOrdersError = Exception('pharmacy service unavailable');
      final container = _buildContainer(home: home, city: 'Pune');
      addTearDown(container.dispose);
      final loaded = await container.read(homeControllerProvider.future);
      expect(loaded.medicineOrders.hasError, isTrue);

      home.medicineOrdersError = null;
      home.medicineOrders = [_medicineOrder(id: 'o1', status: 'PENDING')];
      await container.read(homeControllerProvider.notifier).retryMedicineOrders();

      final data = container.read(homeControllerProvider).value!;
      expect(data.activeMedicineOrders.value!.map((o) => o.id), ['o1']);
    });
  });
}
