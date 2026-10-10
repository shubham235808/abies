/// Matches `SessionUser` in `packages/domain/src/server/session.ts` — same
/// class as apps/mobile's. No `name` field exists on the session.
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

/// The roles this app is for. Exactly the set `GET /api/v1/support/tickets/
/// queue` admits (`requireRole(ctx, 'CUSTOMER_SUPPORT', 'TECH_SUPPORT',
/// 'SALES', 'CARE_COORDINATOR', 'ADMIN')` in
/// apps/platform-api/src/app/api/v1/support/tickets/queue/route.ts) — any
/// other account (a patient, a doctor, or an ops role with no support queue
/// such as MARKETING/AUDITOR/CRM_ADMIN) would only ever see a 403 here, so
/// it is turned away at sign-in instead.
const supportQueueRoles = <String>{'CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR', 'ADMIN'};

/// Human label for the queue a role works (`departmentForRole` in
/// packages/domain/src/modules/support/tickets.service.ts). ADMIN sees every
/// department's tickets.
String queueLabelForRole(String role) {
  switch (role) {
    case 'CUSTOMER_SUPPORT':
      return 'Customer Support';
    case 'TECH_SUPPORT':
      return 'Technical Support';
    case 'SALES':
      return 'Sales';
    case 'CARE_COORDINATOR':
      return 'Care Coordination';
    case 'ADMIN':
      return 'All departments';
    default:
      return role;
  }
}
