/// Matches `SessionUser` in `packages/domain/src/server/session.ts` exactly —
/// note there is no `name` field here (a doctor's display name lives on
/// `DoctorProfile`, fetched via `GET /api/v1/doctors/me`, not the session).
class SessionUser {
  const SessionUser({required this.id, required this.mobile, required this.email, required this.role});

  final String id;
  final String mobile;
  final String? email;
  final String role;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      mobile: json['mobile'] as String,
      email: json['email'] as String?,
      role: json['role'] as String,
    );
  }

  /// The only role this app serves. The backend enforces it on every
  /// `/doctors/me*`, `/consultations/*` and `/prescriptions/*` route
  /// (`requireRole(ctx, 'DOCTOR')`); this is just so the app can refuse a
  /// patient/lab/admin session up front instead of failing on every screen.
  bool get isDoctor => role == 'DOCTOR';
}
