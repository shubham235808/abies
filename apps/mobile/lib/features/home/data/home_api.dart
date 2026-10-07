import '../../../core/api/api_client.dart';
import '../domain/appointment_summary.dart';
import '../domain/diagnostic_order_summary.dart';
import '../domain/diagnostic_preview.dart';
import '../domain/doctor_preview.dart';
import '../domain/medicine_order_summary.dart';
import '../domain/medicine_preview.dart';
import '../domain/panchakarma_booking_summary.dart';
import '../domain/panchakarma_preview.dart';

/// Talks to the existing `/api/v1/public/*` and `/api/v1/*/mine` routes only
/// — nothing here invents an endpoint (docs/mobile/IMPLEMENTATION-PLAN.md
/// Phase 3 consumes only routes already built for the website). Behind one
/// interface, mirroring `AuthApi`'s shape, so [HomeController] is
/// unit-testable with a fake, with no real `ApiClient`.
abstract class HomeApi {
  /// `GET /api/v1/public/doctors?limit=&city=`. [city] is the signed-in
  /// patient's own `PatientProfile.city` (Phase 2) — this phase never reads
  /// device location (see HomeController's doc comment).
  Future<List<DoctorPreview>> previewDoctors({String? city, int limit = 8});

  /// `GET /api/v1/public/panchakarma?limit=&city=`.
  Future<List<PanchakarmaPreview>> previewPanchakarma({String? city, int limit = 8});

  /// `GET /api/v1/public/diagnostics?limit=&city=`.
  Future<List<DiagnosticPreview>> previewDiagnostics({String? city, int limit = 8});

  /// `GET /api/v1/public/medicines?limit=&area=`. The medicines catalogue's
  /// own location filter is named `area` (`PharmacyInventory`'s
  /// `serviceAreas`), not `city` —
  /// `packages/domain/src/modules/medicines/catalogue.schemas.ts`'s
  /// `publicMedicineSearchSchema`. The patient's city is passed through as
  /// that same best-effort location signal.
  Future<List<MedicinePreview>> previewMedicines({String? area, int limit = 8});

  /// `GET /api/v1/appointments/mine`. Returns every appointment, newest
  /// first (the backend's own ordering) — [HomeController] filters to
  /// upcoming ones.
  Future<List<AppointmentSummary>> myAppointments();

  /// `GET /api/v1/medicine-orders/mine`.
  Future<List<MedicineOrderSummary>> myMedicineOrders();

  /// `GET /api/v1/diagnostic-orders/mine`.
  Future<List<DiagnosticOrderSummary>> myDiagnosticOrders();

  /// `GET /api/v1/panchakarma-bookings/mine`.
  Future<List<PanchakarmaBookingSummary>> myPanchakarmaBookings();
}

class HomeApiImpl implements HomeApi {
  HomeApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<DoctorPreview>> previewDoctors({String? city, int limit = 8}) {
    return _client.get<List<DoctorPreview>>(
      '/api/v1/public/doctors',
      query: {
        'limit': limit.toString(),
        if (city != null && city.isNotEmpty) 'city': city,
      },
      decode: (json) => ((json as Map<String, dynamic>)['doctors'] as List<dynamic>)
          .map((e) => DoctorPreview.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<PanchakarmaPreview>> previewPanchakarma({String? city, int limit = 8}) {
    return _client.get<List<PanchakarmaPreview>>(
      '/api/v1/public/panchakarma',
      query: {
        'limit': limit.toString(),
        if (city != null && city.isNotEmpty) 'city': city,
      },
      decode: (json) => ((json as Map<String, dynamic>)['therapies'] as List<dynamic>)
          .map((e) => PanchakarmaPreview.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<DiagnosticPreview>> previewDiagnostics({String? city, int limit = 8}) {
    return _client.get<List<DiagnosticPreview>>(
      '/api/v1/public/diagnostics',
      query: {
        'limit': limit.toString(),
        if (city != null && city.isNotEmpty) 'city': city,
      },
      decode: (json) => ((json as Map<String, dynamic>)['tests'] as List<dynamic>)
          .map((e) => DiagnosticPreview.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<MedicinePreview>> previewMedicines({String? area, int limit = 8}) {
    return _client.get<List<MedicinePreview>>(
      '/api/v1/public/medicines',
      query: {
        'limit': limit.toString(),
        if (area != null && area.isNotEmpty) 'area': area,
      },
      decode: (json) => ((json as Map<String, dynamic>)['medicines'] as List<dynamic>)
          .map((e) => MedicinePreview.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<AppointmentSummary>> myAppointments() {
    return _client.get<List<AppointmentSummary>>(
      '/api/v1/appointments/mine',
      decode: (json) => ((json as Map<String, dynamic>)['appointments'] as List<dynamic>)
          .map((e) => AppointmentSummary.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<MedicineOrderSummary>> myMedicineOrders() {
    return _client.get<List<MedicineOrderSummary>>(
      '/api/v1/medicine-orders/mine',
      decode: (json) => ((json as Map<String, dynamic>)['orders'] as List<dynamic>)
          .map((e) => MedicineOrderSummary.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<DiagnosticOrderSummary>> myDiagnosticOrders() {
    return _client.get<List<DiagnosticOrderSummary>>(
      '/api/v1/diagnostic-orders/mine',
      decode: (json) => ((json as Map<String, dynamic>)['orders'] as List<dynamic>)
          .map((e) => DiagnosticOrderSummary.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<PanchakarmaBookingSummary>> myPanchakarmaBookings() {
    return _client.get<List<PanchakarmaBookingSummary>>(
      '/api/v1/panchakarma-bookings/mine',
      decode: (json) => ((json as Map<String, dynamic>)['bookings'] as List<dynamic>)
          .map((e) => PanchakarmaBookingSummary.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
