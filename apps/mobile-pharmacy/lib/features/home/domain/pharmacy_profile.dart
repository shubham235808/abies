/// The subset of `Pharmacy` (packages/domain/prisma/schema.prisma ~line 1365)
/// this app shows, from `GET /api/v1/pharmacies/me` -> `{pharmacy}`
/// (`getMyPharmacy`, which lazily creates a DRAFT profile on first call).
class PharmacyProfile {
  const PharmacyProfile({required this.id, required this.verificationStatus, this.name, this.rejectionReason, this.serviceAreas = const []});

  final String id;
  final String? name;

  /// `PharmacyVerificationStatus`: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED,
  /// REJECTED, SUSPENDED.
  final String verificationStatus;
  final String? rejectionReason;
  final List<String> serviceAreas;

  bool get isApproved => verificationStatus == 'APPROVED';

  factory PharmacyProfile.fromJson(Map<String, dynamic> json) {
    return PharmacyProfile(
      id: json['id'] as String,
      name: json['name'] as String?,
      verificationStatus: json['verificationStatus'] as String? ?? 'DRAFT',
      rejectionReason: json['rejectionReason'] as String?,
      serviceAreas: (json['serviceAreas'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
    );
  }
}
