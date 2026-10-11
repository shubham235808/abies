/// Therapist credential documents — the Prisma `TherapistDocument` model
/// (packages/domain/prisma/schema.prisma) as serialized by
/// `GET/POST /api/v1/panchakarma-centres/me/therapists/[id]/documents`.
/// Labels match apps/partner-web/.../therapists/[id]/documents-manager.tsx.
library;

/// `therapistDocumentTypeSchema` (packages/domain/src/modules/panchakarma/
/// catalogue.schemas.ts). [wire] is what the route's `type` form field takes.
enum TherapistDocumentType {
  idProof('ID_PROOF', 'ID proof'),
  qualificationCertificate('QUALIFICATION_CERTIFICATE', 'Qualification certificate'),
  profilePhoto('PROFILE_PHOTO', 'Profile photo'),
  other('OTHER', 'Other');

  const TherapistDocumentType(this.wire, this.label);

  final String wire;
  final String label;

  static TherapistDocumentType? fromWire(String? raw) {
    for (final t in values) {
      if (t.wire == raw) return t;
    }
    return null;
  }
}

/// The `TherapistDocumentStatus` Prisma enum. Admin review
/// (POST /api/v1/admin/therapists/[id]/documents/[documentId]/review,
/// outcomes VERIFY / REJECT / REQUEST_RESUBMISSION) moves a document out of
/// PENDING; a centre can't change it, only remove and re-upload.
enum TherapistDocumentStatus {
  pending('Pending review'),
  verified('Verified'),
  rejected('Rejected'),
  resubmissionRequired('Resubmission required'),
  unknown('Unknown');

  const TherapistDocumentStatus(this.label);

  final String label;

  static TherapistDocumentStatus fromWire(String? raw) => switch (raw) {
        'PENDING' => pending,
        'VERIFIED' => verified,
        'REJECTED' => rejected,
        'RESUBMISSION_REQUIRED' => resubmissionRequired,
        _ => unknown,
      };
}

class TherapistDocument {
  const TherapistDocument({
    required this.id,
    required this.therapistId,
    required this.rawType,
    required this.status,
    required this.originalName,
    required this.mimeType,
    required this.sizeBytes,
    required this.reviewNote,
    required this.createdAt,
  });

  final String id;
  final String therapistId;

  /// The stored `type` string (a plain `String` column, validated by the
  /// schema enum on upload) — kept raw so an unexpected value still shows.
  final String rawType;
  final TherapistDocumentStatus status;
  final String originalName;
  final String mimeType;
  final int sizeBytes;
  final String? reviewNote;
  final DateTime? createdAt;

  TherapistDocumentType? get type => TherapistDocumentType.fromWire(rawType);
  String get typeLabel => type?.label ?? rawType;

  /// The admin's note matters to the centre only when it asks for action.
  bool get needsAction => status == TherapistDocumentStatus.rejected || status == TherapistDocumentStatus.resubmissionRequired;

  factory TherapistDocument.fromJson(Map<String, dynamic> json) {
    final created = json['createdAt'] as String?;
    return TherapistDocument(
      id: json['id'] as String,
      therapistId: json['therapistId'] as String? ?? '',
      rawType: json['type'] as String? ?? '',
      status: TherapistDocumentStatus.fromWire(json['status'] as String?),
      originalName: json['originalName'] as String? ?? 'Document',
      mimeType: json['mimeType'] as String? ?? '',
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      reviewNote: json['reviewNote'] as String?,
      createdAt: created == null ? null : DateTime.parse(created).toLocal(),
    );
  }
}

/// A locally picked file ready to send as the multipart `file` field.
///
/// The server's checks (packages/domain/src/lib/storage.ts
/// `assertUploadAllowed`, called by catalogue.service.ts
/// `addTherapistDocument`): declared MIME type must be one of
/// `application/pdf`, `image/jpeg`, `image/png`; size must be at most
/// `UPLOAD_MAX_BYTES` (env, default 10 MiB); the leading magic bytes must
/// match the declared type. Those failures are thrown as a plain `Error`,
/// which `errorResponse` turns into a generic 500 "Something went wrong" —
/// so the type/size checks are mirrored here to give a useful message
/// before the request is ever sent.
class TherapistDocumentUpload {
  const TherapistDocumentUpload({required this.path, required this.filename, required this.mimeType, required this.sizeBytes});

  final String path;
  final String filename;
  final String mimeType;
  final int sizeBytes;

  static const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];

  /// storage.ts's default `UPLOAD_MAX_BYTES` (packages/domain/src/lib/env.ts).
  static const maxBytes = 10 * 1024 * 1024;

  /// Null when the extension isn't one the server accepts. Same mapping as
  /// apps/mobile-diagnostics' `ReportUpload.mimeTypeFor`.
  static String? mimeTypeFor(String filename) {
    final dot = filename.lastIndexOf('.');
    if (dot < 0) return null;
    return switch (filename.substring(dot + 1).toLowerCase()) {
      'pdf' => 'application/pdf',
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      _ => null,
    };
  }

  /// Validates a picked file; returns either the upload or a user-facing
  /// reason it can't be sent.
  static (TherapistDocumentUpload?, String?) fromPicked({required String? path, required String name, required int size}) {
    if (path == null) return (null, 'Couldn’t read that file. Try picking it again.');
    final mime = mimeTypeFor(name);
    if (mime == null) return (null, 'Only PDF, JPG or PNG files are accepted.');
    if (size <= 0) return (null, 'That file is empty.');
    if (size > maxBytes) return (null, 'File is too large — the limit is 10 MB.');
    return (TherapistDocumentUpload(path: path, filename: name, mimeType: mime, sizeBytes: size), null);
  }
}
