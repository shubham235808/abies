/// One field-level validation error, matching the `issues[]` shape the
/// backend's zod validation errors already use
/// (`packages/domain/src/lib/errors.ts`'s `ZodError` mapping) — the same
/// contract `apps/client-web`'s `ApiError.issues` reads today.
class ApiFieldIssue {
  const ApiFieldIssue({required this.path, required this.message});

  final List<String> path;
  final String message;

  factory ApiFieldIssue.fromJson(Map<String, dynamic> json) {
    return ApiFieldIssue(
      path: (json['path'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      message: json['message'] as String? ?? 'Invalid value',
    );
  }
}

/// Thrown by [ApiClient] for every non-2xx response and every transport
/// failure (timeout, no connection, malformed response). Never carries a raw
/// exception/stack trace from the backend — only what's safe to show a user
/// or write to a crash report (docs/mobile/SECURITY-DESIGN.md §7).
class ApiException implements Exception {
  const ApiException({
    required this.message,
    required this.statusCode,
    this.issues = const [],
    this.requestId,
  });

  /// User-facing message. For a validation failure this is the backend's own
  /// `error` field; for a transport failure it's a generic, safe message.
  final String message;

  /// HTTP status code, or -1 for a transport failure that never reached the
  /// server (no connection, timeout, DNS failure).
  final int statusCode;

  final List<ApiFieldIssue> issues;

  /// Correlates this failure with the backend's own request-id logging —
  /// never log the response body itself, only this.
  final String? requestId;

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isRateLimited => statusCode == 429;
  bool get isTransportFailure => statusCode == -1;

  @override
  String toString() => 'ApiException($statusCode, $message)';
}
