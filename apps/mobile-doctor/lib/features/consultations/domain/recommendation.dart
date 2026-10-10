/// A diagnostic or Panchakarma recommendation as listed by
/// `GET /api/v1/doctors/me/diagnostic-recommendations` /
/// `GET /api/v1/doctors/me/panchakarma-recommendations` (each
/// `recommendations.service.ts` `listMineAsDoctor`, full Prisma row incl.
/// `consultationId`, plus `test`/`package`/`therapy` `{name}`). There is no
/// per-consultation list route, so the consultation screen filters these by
/// [consultationId] client-side.
class Recommendation {
  const Recommendation({
    required this.id,
    required this.consultationId,
    required this.status,
    required this.clinicalReason,
    required this.itemName,
    this.sessionCountRecommended,
  });

  final String id;
  final String consultationId;

  /// RECOMMENDED | BOOKED | FULFILLED | CANCELLED.
  final String status;
  final String? clinicalReason;

  /// Test/package name (diagnostics) or therapy name (Panchakarma); null
  /// when the doctor left it unspecified ("any lab / any centre").
  final String? itemName;
  final int? sessionCountRecommended;

  factory Recommendation.diagnosticFromJson(Map<String, dynamic> json) => Recommendation(
        id: json['id'] as String,
        consultationId: json['consultationId'] as String,
        status: json['status'] as String,
        clinicalReason: json['clinicalReason'] as String?,
        itemName: (json['test'] as Map<String, dynamic>?)?['name'] as String? ??
            (json['package'] as Map<String, dynamic>?)?['name'] as String?,
      );

  factory Recommendation.panchakarmaFromJson(Map<String, dynamic> json) => Recommendation(
        id: json['id'] as String,
        consultationId: json['consultationId'] as String,
        status: json['status'] as String,
        clinicalReason: json['clinicalReason'] as String?,
        itemName: (json['therapy'] as Map<String, dynamic>?)?['name'] as String?,
        sessionCountRecommended: json['sessionCountRecommended'] as int?,
      );
}
