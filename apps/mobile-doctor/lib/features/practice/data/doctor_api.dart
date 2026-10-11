import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../domain/doctor_appointment.dart';
import '../domain/doctor_profile.dart';
import '../domain/profile_inputs.dart';

/// `/api/v1/doctors/me*` — every route `requireRole(ctx, 'DOCTOR')`.
abstract class DoctorApi {
  /// `GET /api/v1/doctors/me`.
  Future<DoctorProfile> me();

  /// `GET /api/v1/doctors/me/appointments`.
  Future<List<DoctorAppointment>> appointments();

  /// `POST /api/v1/doctors/me/availability` (createAvailabilitySchema).
  Future<AvailabilityWindow> addAvailability({
    required int dayOfWeek,
    required String startTime,
    required String endTime,
    required int slotMinutes,
    required String mode,
    String? clinicId,
  });

  /// `PATCH /api/v1/doctors/me/availability/[id]` (updateAvailabilitySchema
  /// — partial). Only `active` is toggled from this app.
  Future<AvailabilityWindow> setAvailabilityActive(String id, bool active);

  /// `DELETE /api/v1/doctors/me/availability/[id]`.
  Future<void> removeAvailability(String id);

  /// `PATCH /api/v1/doctors/me` (updateDoctorProfileSchema, all optional) →
  /// `{ profile, completion }`. 403 outside DRAFT/REJECTED; editing a
  /// REJECTED application resets it to DRAFT (doctors.service.ts `updateMe`).
  Future<DoctorProfile> updateProfile(Map<String, dynamic> body);

  /// `POST /api/v1/doctors/me/submit` (submitApplicationSchema:
  /// `{ declarationAccepted }`). 400 lists what's still missing.
  Future<void> submitApplication({required bool declarationAccepted});

  /// `POST /api/v1/doctors/me/documents` — multipart `type` + `file` →
  /// `{ document }` (201).
  Future<DoctorDocument> uploadDocument({required String type, required DocumentUpload file});

  /// `DELETE /api/v1/doctors/me/documents/[id]`.
  Future<void> removeDocument(String id);

  /// `GET /api/v1/doctors/me/documents/[id]/download` → `{ url }`, a
  /// short-lived (300 s) signed storage URL.
  Future<String> documentDownloadUrl(String id);

  /// `POST /api/v1/doctors/me/clinics` (createClinicSchema) → `{ clinic }`.
  Future<DoctorClinic> addClinic(ClinicInput input);

  /// `PATCH /api/v1/doctors/me/clinics/[id]` (updateClinicSchema) → `{ clinic }`.
  Future<DoctorClinic> updateClinic(String id, Map<String, dynamic> body);

  /// `DELETE /api/v1/doctors/me/clinics/[id]`.
  Future<void> removeClinic(String id);
}

class DoctorApiImpl implements DoctorApi {
  DoctorApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<DoctorProfile> me() => _client.get<DoctorProfile>(
        '/api/v1/doctors/me',
        decode: (json) => DoctorProfile.fromMeJson(json as Map<String, dynamic>),
      );

  @override
  Future<List<DoctorAppointment>> appointments() => _client.get<List<DoctorAppointment>>(
        '/api/v1/doctors/me/appointments',
        decode: (json) => ((json as Map<String, dynamic>)['appointments'] as List<dynamic>)
            .map((e) => DoctorAppointment.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  Future<AvailabilityWindow> addAvailability({
    required int dayOfWeek,
    required String startTime,
    required String endTime,
    required int slotMinutes,
    required String mode,
    String? clinicId,
  }) =>
      _client.post<AvailabilityWindow>(
        '/api/v1/doctors/me/availability',
        body: {
          'dayOfWeek': dayOfWeek,
          'startTime': startTime,
          'endTime': endTime,
          'slotMinutes': slotMinutes,
          'mode': mode,
          if (mode == 'CLINIC' && clinicId != null) 'clinicId': clinicId,
        },
        decode: (json) => AvailabilityWindow.fromJson((json as Map<String, dynamic>)['slot'] as Map<String, dynamic>),
      );

  @override
  Future<AvailabilityWindow> setAvailabilityActive(String id, bool active) => _client.patch<AvailabilityWindow>(
        '/api/v1/doctors/me/availability/$id',
        body: {'active': active},
        decode: (json) => AvailabilityWindow.fromJson((json as Map<String, dynamic>)['slot'] as Map<String, dynamic>),
      );

  @override
  Future<void> removeAvailability(String id) =>
      _client.delete<void>('/api/v1/doctors/me/availability/$id', decode: (_) {});

  @override
  Future<DoctorProfile> updateProfile(Map<String, dynamic> body) => _client.patch<DoctorProfile>(
        '/api/v1/doctors/me',
        body: body,
        decode: (json) => DoctorProfile.fromMeJson(json as Map<String, dynamic>),
      );

  @override
  Future<void> submitApplication({required bool declarationAccepted}) => _client.post<void>(
        '/api/v1/doctors/me/submit',
        body: {'declarationAccepted': declarationAccepted},
        decode: (_) {},
      );

  @override
  Future<DoctorDocument> uploadDocument({required String type, required DocumentUpload file}) async {
    // Read the file before building the form so a missing file fails here,
    // not mid-request.
    final upload = await MultipartFile.fromFile(file.path, filename: file.filename, contentType: DioMediaType.parse(file.mimeType));
    return _client.postMultipart<DoctorDocument>(
      '/api/v1/doctors/me/documents',
      buildForm: () => FormData.fromMap({'type': type, 'file': upload.clone()}),
      decode: (json) => DoctorDocument.fromJson((json as Map<String, dynamic>)['document'] as Map<String, dynamic>),
    );
  }

  @override
  Future<void> removeDocument(String id) => _client.delete<void>('/api/v1/doctors/me/documents/$id', decode: (_) {});

  @override
  Future<String> documentDownloadUrl(String id) => _client.get<String>(
        '/api/v1/doctors/me/documents/$id/download',
        decode: (json) => (json as Map<String, dynamic>)['url'] as String,
      );

  @override
  Future<DoctorClinic> addClinic(ClinicInput input) => _client.post<DoctorClinic>(
        '/api/v1/doctors/me/clinics',
        body: input.toJson(),
        decode: (json) => DoctorClinic.fromJson((json as Map<String, dynamic>)['clinic'] as Map<String, dynamic>),
      );

  @override
  Future<DoctorClinic> updateClinic(String id, Map<String, dynamic> body) => _client.patch<DoctorClinic>(
        '/api/v1/doctors/me/clinics/$id',
        body: body,
        decode: (json) => DoctorClinic.fromJson((json as Map<String, dynamic>)['clinic'] as Map<String, dynamic>),
      );

  @override
  Future<void> removeClinic(String id) => _client.delete<void>('/api/v1/doctors/me/clinics/$id', decode: (_) {});
}
