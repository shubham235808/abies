/// Matches `SessionUser` in `packages/domain/src/server/session.ts` exactly —
/// note there is no `name` field here (a lab's display name lives on
/// `DiagnosticLab.name`, fetched via `GET /api/v1/labs/me`, not the session).
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
}
