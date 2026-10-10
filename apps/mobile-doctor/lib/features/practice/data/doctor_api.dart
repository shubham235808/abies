import '../../../core/api/api_client.dart';
import '../domain/doctor_appointment.dart';
import '../domain/doctor_profile.dart';

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
}
