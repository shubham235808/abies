/// Client models for the PANCHAKARMA_CENTRE partner surface. Every field
/// name here is taken from the real Prisma models in
/// `packages/domain/prisma/schema.prisma` (PanchakarmaCentre, Therapy,
/// Therapist, PanchakarmaBooking, PanchakarmaSession) as serialized by the
/// `/api/v1/panchakarma-centres/me/*` and `/api/v1/panchakarma-bookings/[id]`
/// routes — Prisma `DateTime` arrives as an ISO-8601 string.
library;

DateTime? _date(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

/// `PanchakarmaCentreVerificationStatus` enum.
enum CentreVerificationStatus { draft, submitted, underReview, approved, rejected, suspended, unknown }

CentreVerificationStatus _verificationFrom(String? raw) {
  switch (raw) {
    case 'DRAFT':
      return CentreVerificationStatus.draft;
    case 'SUBMITTED':
      return CentreVerificationStatus.submitted;
    case 'UNDER_REVIEW':
      return CentreVerificationStatus.underReview;
    case 'APPROVED':
      return CentreVerificationStatus.approved;
    case 'REJECTED':
      return CentreVerificationStatus.rejected;
    case 'SUSPENDED':
      return CentreVerificationStatus.suspended;
    default:
      return CentreVerificationStatus.unknown;
  }
}

/// `GET /api/v1/panchakarma-centres/me` → `{ centre }` (centres.service.ts
/// `getMyCentre`, which lazily creates a DRAFT profile on first call).
class CentreProfile {
  const CentreProfile({
    required this.id,
    required this.name,
    required this.addressLine1,
    required this.city,
    required this.state,
    required this.postalCode,
    required this.supervisingPractitioner,
    required this.licenseNumbers,
    required this.verificationStatus,
    required this.rejectionReason,
  });

  final String id;
  final String? name;
  final String? addressLine1;
  final String? city;
  final String? state;
  final String? postalCode;
  final String? supervisingPractitioner;
  final List<String> licenseNumbers;
  final CentreVerificationStatus verificationStatus;
  final String? rejectionReason;

  /// Same rule as centres.service.ts `editableStatus`: only DRAFT/REJECTED
  /// profiles may be edited or (re)submitted.
  bool get isEditable =>
      verificationStatus == CentreVerificationStatus.draft || verificationStatus == CentreVerificationStatus.rejected;

  bool get isApproved => verificationStatus == CentreVerificationStatus.approved;

  factory CentreProfile.fromJson(Map<String, dynamic> json) {
    return CentreProfile(
      id: json['id'] as String,
      name: json['name'] as String?,
      addressLine1: json['addressLine1'] as String?,
      city: json['city'] as String?,
      state: json['state'] as String?,
      postalCode: json['postalCode'] as String?,
      supervisingPractitioner: json['supervisingPractitioner'] as String?,
      licenseNumbers: (json['licenseNumbers'] as List<dynamic>? ?? const []).cast<String>(),
      verificationStatus: _verificationFrom(json['verificationStatus'] as String?),
      rejectionReason: json['rejectionReason'] as String?,
    );
  }
}

/// `PanchakarmaBookingStatus` enum (RECOMMENDED is never a booking's own
/// status in practice — bookings are created BOOKED).
enum BookingStatus { booked, scheduled, inProgress, completed, cancelled, unknown }

BookingStatus bookingStatusFrom(String? raw) {
  switch (raw) {
    case 'BOOKED':
      return BookingStatus.booked;
    case 'SCHEDULED':
      return BookingStatus.scheduled;
    case 'IN_PROGRESS':
      return BookingStatus.inProgress;
    case 'COMPLETED':
      return BookingStatus.completed;
    case 'CANCELLED':
      return BookingStatus.cancelled;
    default:
      return BookingStatus.unknown;
  }
}

extension BookingStatusLabel on BookingStatus {
  String get label {
    switch (this) {
      case BookingStatus.booked:
        return 'Booked';
      case BookingStatus.scheduled:
        return 'Scheduled';
      case BookingStatus.inProgress:
        return 'In progress';
      case BookingStatus.completed:
        return 'Completed';
      case BookingStatus.cancelled:
        return 'Cancelled';
      case BookingStatus.unknown:
        return 'Unknown';
    }
  }
}

class CentreSession {
  const CentreSession({
    required this.id,
    required this.sessionNumber,
    required this.scheduledAt,
    required this.attendedAt,
    required this.therapistId,
    required this.therapistName,
    required this.notes,
    required this.exceptionFlag,
  });

  final String id;
  final int sessionNumber;
  final DateTime scheduledAt;
  final DateTime? attendedAt;
  final String? therapistId;

  /// Only present from `GET /panchakarma-bookings/[id]` (`getBooking`'s
  /// `sessions.therapist.select.name`); the centre list route has no
  /// therapist join, so it's null there.
  final String? therapistName;
  final String? notes;
  final String? exceptionFlag;

  bool get isAttended => attendedAt != null;

  factory CentreSession.fromJson(Map<String, dynamic> json) {
    final therapist = json['therapist'] as Map<String, dynamic>?;
    return CentreSession(
      id: json['id'] as String,
      sessionNumber: json['sessionNumber'] as int,
      scheduledAt: _date(json['scheduledAt'])!,
      attendedAt: _date(json['attendedAt']),
      therapistId: json['therapistId'] as String?,
      therapistName: therapist?['name'] as String?,
      notes: json['notes'] as String?,
      exceptionFlag: json['exceptionFlag'] as String?,
    );
  }
}

/// One booking, from either `GET /panchakarma-centres/me/bookings`
/// (`listMineAsCentre` — paid bookings only, `payment.status = SUCCESS`) or
/// `GET /panchakarma-bookings/[id]` (`getBooking`). Both include
/// `patientUser { mobile, patientProfile { firstName, lastName } }`,
/// `therapy { name }` and `sessions`; the detail route adds
/// `therapy.durationMinutes`, `sessions[].therapist` and `payment`.
class CentreBooking {
  const CentreBooking({
    required this.id,
    required this.status,
    required this.sessionCount,
    required this.createdAt,
    required this.patientName,
    required this.therapyName,
    required this.therapyDurationMinutes,
    required this.sessions,
    required this.paymentAmount,
    required this.cancellationReason,
  });

  final String id;
  final BookingStatus status;
  final int sessionCount;
  final DateTime createdAt;
  final String patientName;
  final String therapyName;
  final int? therapyDurationMinutes;
  final List<CentreSession> sessions;
  final int? paymentAmount;
  final String? cancellationReason;

  int get attendedCount => sessions.where((s) => s.isAttended).length;

  /// Mirrors the backend's own guards in bookings.service.ts
  /// `scheduleSession`: status must be BOOKED/SCHEDULED/IN_PROGRESS, and
  /// existing session count must be below `sessionCount` (the backend
  /// throws ConflictError "All sessions for this booking have already been
  /// scheduled" otherwise — "refuses to schedule beyond the booked session
  /// count" in tests/integration/panchakarma.test.ts).
  bool get canScheduleMore =>
      sessions.length < sessionCount &&
      (status == BookingStatus.booked || status == BookingStatus.scheduled || status == BookingStatus.inProgress);

  /// bookings.service.ts `markSessionAttended`: the session must not be
  /// attended yet ("refuses marking a session attended twice") and the
  /// booking must be SCHEDULED or IN_PROGRESS.
  bool canMarkAttended(CentreSession session) =>
      !session.isAttended && (status == BookingStatus.scheduled || status == BookingStatus.inProgress);

  /// bookings.service.ts `cancelBooking`: only BOOKED or SCHEDULED.
  bool get isCancellable => status == BookingStatus.booked || status == BookingStatus.scheduled;

  bool get isActive =>
      status == BookingStatus.booked || status == BookingStatus.scheduled || status == BookingStatus.inProgress;

  factory CentreBooking.fromJson(Map<String, dynamic> json) {
    final patientUser = json['patientUser'] as Map<String, dynamic>?;
    final profile = patientUser?['patientProfile'] as Map<String, dynamic>?;
    final fullName = [profile?['firstName'], profile?['lastName']].whereType<String>().where((s) => s.isNotEmpty).join(' ');
    final therapy = json['therapy'] as Map<String, dynamic>?;
    final payment = json['payment'] as Map<String, dynamic>?;
    final sessions = (json['sessions'] as List<dynamic>? ?? const [])
        .map((e) => CentreSession.fromJson(e as Map<String, dynamic>))
        .toList()
      ..sort((a, b) => a.sessionNumber.compareTo(b.sessionNumber));
    return CentreBooking(
      id: json['id'] as String,
      status: bookingStatusFrom(json['status'] as String?),
      sessionCount: json['sessionCount'] as int,
      createdAt: _date(json['createdAt'])!,
      // Same fallback as the partner web portal: profile name, else mobile.
      patientName: fullName.isNotEmpty ? fullName : (patientUser?['mobile'] as String? ?? 'Patient'),
      therapyName: therapy?['name'] as String? ?? 'Therapy',
      therapyDurationMinutes: therapy?['durationMinutes'] as int?,
      sessions: sessions,
      paymentAmount: payment?['amount'] as int?,
      cancellationReason: json['cancellationReason'] as String?,
    );
  }
}

/// `Therapy` model — `GET/POST /panchakarma-centres/me/therapies`,
/// `PATCH/DELETE /panchakarma-centres/me/therapies/[id]`.
class Therapy {
  const Therapy({
    required this.id,
    required this.name,
    required this.description,
    required this.durationMinutes,
    required this.prerequisites,
    required this.contraindications,
    required this.price,
    required this.requiredSupervision,
    required this.active,
  });

  final String id;
  final String name;
  final String? description;
  final int? durationMinutes;
  final String? prerequisites;
  final String? contraindications;

  /// Whole rupees per session (`price Int`, zod `int().min(0).max(1_000_000)`).
  final int price;
  final bool requiredSupervision;
  final bool active;

  factory Therapy.fromJson(Map<String, dynamic> json) {
    return Therapy(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      durationMinutes: json['durationMinutes'] as int?,
      prerequisites: json['prerequisites'] as String?,
      contraindications: json['contraindications'] as String?,
      price: json['price'] as int,
      requiredSupervision: json['requiredSupervision'] as bool? ?? false,
      active: json['active'] as bool? ?? true,
    );
  }
}

/// Body for creating/updating a therapy — field names and bounds from
/// `createTherapySchema` in catalogue.schemas.ts.
class TherapyInput {
  const TherapyInput({
    required this.name,
    required this.price,
    this.description,
    this.durationMinutes,
    this.prerequisites,
    this.contraindications,
    this.requiredSupervision = false,
  });

  final String name;
  final int price;
  final String? description;
  final int? durationMinutes;
  final String? prerequisites;
  final String? contraindications;
  final bool requiredSupervision;

  Map<String, dynamic> toJson() => {
        'name': name,
        'price': price,
        if (description != null && description!.isNotEmpty) 'description': description,
        if (durationMinutes != null) 'durationMinutes': durationMinutes,
        if (prerequisites != null && prerequisites!.isNotEmpty) 'prerequisites': prerequisites,
        if (contraindications != null && contraindications!.isNotEmpty) 'contraindications': contraindications,
        'requiredSupervision': requiredSupervision,
      };
}

/// `Therapist` model — `GET/POST /panchakarma-centres/me/therapists`,
/// `PATCH/DELETE /panchakarma-centres/me/therapists/[id]`.
class Therapist {
  const Therapist({
    required this.id,
    required this.name,
    required this.qualifications,
    required this.languages,
    required this.active,
  });

  final String id;
  final String name;
  final String? qualifications;
  final List<String> languages;
  final bool active;

  factory Therapist.fromJson(Map<String, dynamic> json) {
    return Therapist(
      id: json['id'] as String,
      name: json['name'] as String,
      qualifications: json['qualifications'] as String?,
      languages: (json['languages'] as List<dynamic>? ?? const []).cast<String>(),
      active: json['active'] as bool? ?? true,
    );
  }
}

/// Body for creating/updating a therapist — `createTherapistSchema`.
class TherapistInput {
  const TherapistInput({required this.name, this.qualifications, this.languages = const []});

  final String name;
  final String? qualifications;
  final List<String> languages;

  Map<String, dynamic> toJson() => {
        'name': name,
        if (qualifications != null && qualifications!.isNotEmpty) 'qualifications': qualifications,
        'languages': languages,
      };
}

/// Body for `PATCH /panchakarma-centres/me` — `updateCentreProfileSchema`
/// (every field optional; each non-empty string min 1).
class CentreProfileInput {
  const CentreProfileInput({
    required this.name,
    required this.addressLine1,
    required this.city,
    required this.state,
    required this.postalCode,
    required this.supervisingPractitioner,
    required this.licenseNumbers,
  });

  final String name;
  final String addressLine1;
  final String city;
  final String state;
  final String postalCode;
  final String supervisingPractitioner;
  final List<String> licenseNumbers;

  Map<String, dynamic> toJson() {
    String? nonEmpty(String v) => v.trim().isEmpty ? null : v.trim();
    return {
      if (nonEmpty(name) != null) 'name': nonEmpty(name),
      if (nonEmpty(addressLine1) != null) 'addressLine1': nonEmpty(addressLine1),
      if (nonEmpty(city) != null) 'city': nonEmpty(city),
      if (nonEmpty(state) != null) 'state': nonEmpty(state),
      if (nonEmpty(postalCode) != null) 'postalCode': nonEmpty(postalCode),
      if (nonEmpty(supervisingPractitioner) != null) 'supervisingPractitioner': nonEmpty(supervisingPractitioner),
      'licenseNumbers': licenseNumbers.map((l) => l.trim()).where((l) => l.isNotEmpty).toList(),
    };
  }
}
