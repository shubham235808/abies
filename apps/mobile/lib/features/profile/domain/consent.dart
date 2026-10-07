/// Matches `ConsentArtifact` in `packages/domain/prisma/schema.prisma`, as
/// returned by the public `GET /api/v1/consent/current`.
class ConsentArtifact {
  const ConsentArtifact({required this.id, required this.key, required this.version, required this.title, required this.isRequired, this.bodyUrl});

  final String id;
  final String key;
  final String version;
  final String title;
  final bool isRequired;
  final String? bodyUrl;

  factory ConsentArtifact.fromJson(Map<String, dynamic> json) {
    return ConsentArtifact(
      id: json['id'] as String,
      key: json['key'] as String,
      version: json['version'] as String,
      title: json['title'] as String,
      isRequired: json['required'] as bool,
      bodyUrl: json['bodyUrl'] as String?,
    );
  }
}

/// Matches `ConsentRecord`. `listUserConsents()`
/// (`packages/domain/src/modules/consent/consent.service.ts`) includes the
/// `artifact` relation, so [artifactTitle] is real, not a guess — confirmed
/// by reading that function's `include: { artifact: true }`.
class ConsentRecord {
  const ConsentRecord({required this.id, required this.artifactId, required this.acceptedAt, this.withdrawnAt, this.artifactTitle});

  final String id;
  final String artifactId;
  final String acceptedAt;
  final String? withdrawnAt;
  final String? artifactTitle;

  bool get isActive => withdrawnAt == null;

  factory ConsentRecord.fromJson(Map<String, dynamic> json) {
    final artifact = json['artifact'];
    return ConsentRecord(
      id: json['id'] as String,
      artifactId: json['artifactId'] as String,
      acceptedAt: json['acceptedAt'] as String,
      withdrawnAt: json['withdrawnAt'] as String?,
      artifactTitle: artifact is Map<String, dynamic> ? artifact['title'] as String? : null,
    );
  }
}
