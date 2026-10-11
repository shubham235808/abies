/// The subset of `Pharmacy` (packages/domain/prisma/schema.prisma ~line 1373)
/// this app shows and edits, from `GET /api/v1/pharmacies/me` -> `{pharmacy}`
/// (`getMyPharmacy`, which lazily creates a DRAFT profile on first call).
/// `PATCH /pharmacies/me` and `POST /pharmacies/me/submit` return the same
/// `{pharmacy}` shape.
class PharmacyProfile {
  const PharmacyProfile({
    required this.id,
    required this.verificationStatus,
    this.name,
    this.rejectionReason,
    this.licenseNumbers = const [],
    this.serviceAreas = const [],
  });

  final String id;
  final String? name;

  /// `PharmacyVerificationStatus`: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED,
  /// REJECTED, SUSPENDED.
  final String verificationStatus;
  final String? rejectionReason;
  final List<String> licenseNumbers;
  final List<String> serviceAreas;

  bool get isApproved => verificationStatus == 'APPROVED';

  /// Mirrors `editableStatus()` in pharmacies.service.ts: only a DRAFT or
  /// REJECTED profile can be edited or (re)submitted. Anything else is
  /// locked server-side ("Pharmacy details are locked while verification
  /// is in progress or approved").
  bool get isEditable => verificationStatus == 'DRAFT' || verificationStatus == 'REJECTED';

  /// What `submitPharmacy` will refuse over, in its own order and wording
  /// ("Complete the following before submitting: ...").
  List<String> get missingForSubmission => [
        if (name == null || name!.trim().isEmpty) 'pharmacy name',
        if (licenseNumbers.isEmpty) 'at least one license number',
        if (serviceAreas.isEmpty) 'at least one service area',
      ];

  factory PharmacyProfile.fromJson(Map<String, dynamic> json) {
    List<String> strings(Object? v) => (v as List<dynamic>? ?? const []).map((e) => e.toString()).toList();
    return PharmacyProfile(
      id: json['id'] as String,
      name: json['name'] as String?,
      verificationStatus: json['verificationStatus'] as String? ?? 'DRAFT',
      rejectionReason: json['rejectionReason'] as String?,
      licenseNumbers: strings(json['licenseNumbers']),
      serviceAreas: strings(json['serviceAreas']),
    );
  }
}
