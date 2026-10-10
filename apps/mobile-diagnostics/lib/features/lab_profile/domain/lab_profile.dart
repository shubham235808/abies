/// `DiagnosticLab` (packages/domain/prisma/schema.prisma) as returned by
/// `GET /api/v1/labs/me` → `{ lab }`. `ensureLabProfile` creates an empty
/// DRAFT row on first read, so this always exists for a LAB session.
///
/// Labs have no per-document upload/review subsystem (unlike doctors):
/// license numbers are identifiers an admin verifies externally (schema
/// comment above `model DiagnosticLab`, admin-labs.service.ts header).
class LabProfile {
  const LabProfile({
    required this.id,
    required this.verificationStatus,
    this.name,
    this.licenseNumbers = const [],
    this.serviceCities = const [],
    this.homeCollectionSupported = false,
    this.rejectionReason,
  });

  final String id;
  final String? name;
  final List<String> licenseNumbers;
  final List<String> serviceCities;
  final bool homeCollectionSupported;

  /// DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | SUSPENDED.
  final String verificationStatus;
  final String? rejectionReason;

  bool get isApproved => verificationStatus == 'APPROVED';

  /// `editableStatus` in labs.service.ts — PATCH /labs/me and
  /// POST /labs/me/submit are refused in any other status.
  bool get isEditable => verificationStatus == 'DRAFT' || verificationStatus == 'REJECTED';

  bool get isUnderReview => verificationStatus == 'SUBMITTED' || verificationStatus == 'UNDER_REVIEW';

  String get statusLabel {
    switch (verificationStatus) {
      case 'DRAFT':
        return 'Draft';
      case 'SUBMITTED':
        return 'Submitted';
      case 'UNDER_REVIEW':
        return 'Under review';
      case 'APPROVED':
        return 'Approved';
      case 'REJECTED':
        return 'Rejected';
      case 'SUSPENDED':
        return 'Suspended';
      default:
        return verificationStatus;
    }
  }

  /// What `submitLab` will reject on — checked client-side first so the
  /// user sees the list before tapping submit.
  List<String> get missingForSubmission => [
        if (name == null || name!.trim().isEmpty) 'lab name',
        if (licenseNumbers.isEmpty) 'at least one license number',
        if (serviceCities.isEmpty) 'at least one service city',
      ];

  factory LabProfile.fromJson(Map<String, dynamic> json) {
    List<String> strings(Object? raw) => (raw as List<dynamic>? ?? const []).whereType<String>().toList();
    return LabProfile(
      id: json['id'] as String,
      name: json['name'] as String?,
      licenseNumbers: strings(json['licenseNumbers']),
      serviceCities: strings(json['serviceCities']),
      homeCollectionSupported: json['homeCollectionSupported'] as bool? ?? false,
      verificationStatus: json['verificationStatus'] as String? ?? 'DRAFT',
      rejectionReason: json['rejectionReason'] as String?,
    );
  }
}
