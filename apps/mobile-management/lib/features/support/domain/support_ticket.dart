/// Support ticket models, field-for-field from the real backend:
/// - Prisma `SupportTicket` / `SupportMessage` (packages/domain/prisma/schema.prisma)
/// - `listQueue` include (`requester{mobile}`, `assignedAgent{mobile}`) and
///   `getTicket`'s `detailInclude()` in
///   packages/domain/src/modules/support/tickets.service.ts
/// - the `sla` JSON snapshot written by `buildSlaSnapshot` in
///   packages/domain/src/modules/support/sla.ts.
///
/// Enum values are kept as the backend's raw strings (never remapped), with
/// label helpers for display only.
library;

/// `SupportTicketStatus` (tickets.schemas.ts `updateStatusSchema`).
const ticketStatuses = <String>['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'RESOLVED', 'CLOSED'];

/// `ALLOWED_TRANSITIONS` in tickets.service.ts — plus the service's own
/// "any state may re-open to IN_PROGRESS" escape hatch (`dto.status !==
/// 'IN_PROGRESS' && ...` skips the check for IN_PROGRESS). Used to offer
/// only status changes the backend will actually accept, instead of the
/// web's fixed dropdown that lets an agent pick a transition the server
/// then rejects with a 400.
const _allowedTransitions = <String, List<String>>{
  'OPEN': ['IN_PROGRESS'],
  'IN_PROGRESS': ['WAITING_CUSTOMER', 'WAITING_PARTNER', 'RESOLVED'],
  'WAITING_CUSTOMER': ['IN_PROGRESS'],
  'WAITING_PARTNER': ['IN_PROGRESS'],
  'RESOLVED': ['CLOSED', 'IN_PROGRESS'],
  'CLOSED': ['IN_PROGRESS'],
};

List<String> allowedNextStatuses(String current) {
  final next = <String>{...?_allowedTransitions[current]};
  if (current != 'IN_PROGRESS') next.add('IN_PROGRESS');
  return ticketStatuses.where(next.contains).toList();
}

/// `triageTicketSchema.department` (tickets.schemas.ts). ADMIN_OPERATIONS is
/// accepted by the schema but the web never offers it; same here.
const triageDepartments = <String>['CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATION'];
const ticketPriorities = <String>['P1', 'P2', 'P3', 'P4'];

bool isOpenStatus(String status) => status != 'RESOLVED' && status != 'CLOSED';

/// "OPEN" -> "Open", "WAITING_CUSTOMER" -> "Waiting customer".
String humanizeEnum(String value) {
  final lower = value.replaceAll('_', ' ').toLowerCase();
  return lower.isEmpty ? lower : lower[0].toUpperCase() + lower.substring(1);
}

/// Same labels as the web queue (apps/management-web/src/app/ops/customer-support/page.tsx).
const categoryLabels = <String, String>{
  'BOOKING': 'Booking & scheduling',
  'PAYMENT': 'Payments & refunds',
  'REPORT': 'Diagnostic report',
  'MEDICINE': 'Medicine order',
  'THERAPY': 'Panchakarma therapy',
  'CLINICAL_CONCERN': 'Clinical safety concern',
  'TECHNICAL_ISSUE': 'Technical issue',
  'GENERAL': 'General enquiry',
};

String categoryLabel(String category) => categoryLabels[category] ?? humanizeEnum(category);

DateTime? _date(Object? raw) => raw is String ? DateTime.tryParse(raw) : null;

/// The `sla` JSON column — `{ priority, responseTargetMinutes, responseDueAt,
/// resolutionTarget }`. Nullable in the schema, so every field is optional.
class TicketSla {
  const TicketSla({this.responseTargetMinutes, this.responseDueAt, this.resolutionTarget});

  final int? responseTargetMinutes;
  final DateTime? responseDueAt;
  final String? resolutionTarget;

  static TicketSla? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    return TicketSla(
      responseTargetMinutes: (json['responseTargetMinutes'] as num?)?.toInt(),
      responseDueAt: _date(json['responseDueAt']),
      resolutionTarget: json['resolutionTarget'] as String?,
    );
  }
}

enum SlaState { none, onTrack, breached, closed }

/// Same definition of "breached" the ops web dashboard counts
/// (`supportVolumeBreakdown` in tickets.service.ts): a ticket that is still
/// open and whose `sla.responseDueAt` has passed. Wall-clock only — the
/// backend models no business hours (sla.ts header comment).
SlaState slaStateOf({required String status, required TicketSla? sla, required DateTime now}) {
  if (!isOpenStatus(status)) return SlaState.closed;
  final due = sla?.responseDueAt;
  if (due == null) return SlaState.none;
  return due.isBefore(now) ? SlaState.breached : SlaState.onTrack;
}

/// One row of `GET /api/v1/support/tickets/queue`.
class QueueTicket {
  const QueueTicket({
    required this.id,
    required this.subject,
    required this.category,
    required this.department,
    required this.priority,
    required this.status,
    required this.channel,
    required this.createdAt,
    this.assignedAgentUserId,
    this.resolvedAt,
    this.lastResponseAt,
    this.sla,
    this.requesterMobile,
    this.assignedAgentMobile,
  });

  final String id;
  final String subject;
  final String category;
  final String department;
  final String priority;
  final String status;
  final String channel;
  final DateTime createdAt;
  final String? assignedAgentUserId;
  final DateTime? resolvedAt;
  final DateTime? lastResponseAt;
  final TicketSla? sla;
  final String? requesterMobile;
  final String? assignedAgentMobile;

  bool get isOpen => isOpenStatus(status);

  factory QueueTicket.fromJson(Map<String, dynamic> json) {
    return QueueTicket(
      id: json['id'] as String,
      subject: json['subject'] as String,
      category: json['category'] as String,
      department: json['department'] as String,
      priority: json['priority'] as String,
      status: json['status'] as String,
      channel: json['channel'] as String? ?? 'IN_APP',
      createdAt: DateTime.parse(json['createdAt'] as String),
      assignedAgentUserId: json['assignedAgentUserId'] as String?,
      resolvedAt: _date(json['resolvedAt']),
      lastResponseAt: _date(json['lastResponseAt']),
      sla: TicketSla.fromJson(json['sla']),
      requesterMobile: (json['requester'] as Map<String, dynamic>?)?['mobile'] as String?,
      assignedAgentMobile: (json['assignedAgent'] as Map<String, dynamic>?)?['mobile'] as String?,
    );
  }
}

class TicketMessage {
  const TicketMessage({required this.id, required this.body, required this.createdAt, this.authorId, this.authorMobile, this.authorRole});

  final String id;
  final String body;
  final DateTime createdAt;
  final String? authorId;
  final String? authorMobile;
  final String? authorRole;

  /// Anyone who isn't the PATIENT side — same split `addMessage` uses
  /// (`isStaffAuthor = authorRole !== 'PATIENT'`). Author can be null
  /// (`onDelete: SetNull`) for a deleted account.
  bool get isFromStaff => authorRole != null && authorRole != 'PATIENT';

  factory TicketMessage.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>?;
    return TicketMessage(
      id: json['id'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      authorId: author?['id'] as String? ?? json['authorUserId'] as String?,
      authorMobile: author?['mobile'] as String?,
      authorRole: author?['role'] as String?,
    );
  }
}

class TechnicalIncidentDetail {
  const TechnicalIncidentDetail({this.technicalModule, this.errorClassification, this.browserContext, this.correlationRequestId});

  final String? technicalModule;
  final String? errorClassification;
  final String? browserContext;
  final String? correlationRequestId;

  bool get isEmpty => technicalModule == null && errorClassification == null && browserContext == null && correlationRequestId == null;

  static TechnicalIncidentDetail? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    return TechnicalIncidentDetail(
      technicalModule: json['technicalModule'] as String?,
      errorClassification: json['errorClassification'] as String?,
      browserContext: json['browserContext'] as String?,
      correlationRequestId: json['correlationRequestId'] as String?,
    );
  }
}

/// `GET /api/v1/support/tickets/{id}` → `{ ticket }` (getTicket +
/// detailInclude). `refundablePayments` is deliberately not parsed — refund
/// handling is out of this app's scope (see README).
class TicketDetail {
  const TicketDetail({
    required this.id,
    required this.subject,
    required this.description,
    required this.category,
    required this.department,
    required this.priority,
    required this.status,
    required this.channel,
    required this.createdAt,
    required this.requesterMobile,
    required this.messages,
    this.requesterRole,
    this.assignedAgentUserId,
    this.assignedAgentMobile,
    this.linkedPatientName,
    this.linkedPatientMobile,
    this.sla,
    this.resolvedAt,
    this.technicalIncidentDetail,
  });

  final String id;
  final String subject;
  final String description;
  final String category;
  final String department;
  final String priority;
  final String status;
  final String channel;
  final DateTime createdAt;
  final String requesterMobile;
  final String? requesterRole;
  final String? assignedAgentUserId;
  final String? assignedAgentMobile;
  final String? linkedPatientName;
  final String? linkedPatientMobile;
  final TicketSla? sla;
  final DateTime? resolvedAt;
  final TechnicalIncidentDetail? technicalIncidentDetail;
  final List<TicketMessage> messages;

  bool get isClosed => status == 'CLOSED';
  bool get isAssigned => assignedAgentUserId != null;

  factory TicketDetail.fromJson(Map<String, dynamic> json) {
    final requester = json['requester'] as Map<String, dynamic>? ?? const {};
    final agent = json['assignedAgent'] as Map<String, dynamic>?;
    final patient = json['linkedPatient'] as Map<String, dynamic>?;
    final profile = patient?['patientProfile'] as Map<String, dynamic>?;
    final name = [profile?['firstName'], profile?['lastName']].whereType<String>().where((s) => s.isNotEmpty).join(' ');
    return TicketDetail(
      id: json['id'] as String,
      subject: json['subject'] as String,
      description: json['description'] as String? ?? '',
      category: json['category'] as String,
      department: json['department'] as String,
      priority: json['priority'] as String,
      status: json['status'] as String,
      channel: json['channel'] as String? ?? 'IN_APP',
      createdAt: DateTime.parse(json['createdAt'] as String),
      requesterMobile: requester['mobile'] as String? ?? '',
      requesterRole: requester['role'] as String?,
      assignedAgentUserId: json['assignedAgentUserId'] as String? ?? agent?['id'] as String?,
      assignedAgentMobile: agent?['mobile'] as String?,
      linkedPatientName: name.isEmpty ? null : name,
      linkedPatientMobile: patient?['mobile'] as String?,
      sla: TicketSla.fromJson(json['sla']),
      resolvedAt: _date(json['resolvedAt']),
      technicalIncidentDetail: TechnicalIncidentDetail.fromJson(json['technicalIncidentDetail']),
      messages: (json['messages'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TicketMessage.fromJson)
          .toList(),
    );
  }
}
