import '../../../core/api/api_client.dart';
import '../domain/consent.dart';

abstract class ConsentApi {
  /// Public — `GET /api/v1/consent/current` needs no session (a visitor must
  /// see what they're agreeing to before they've signed in).
  Future<List<ConsentArtifact>> listCurrentArtifacts();
  Future<List<ConsentRecord>> listMyConsents();
  Future<ConsentRecord> accept(String artifactId);
  Future<ConsentRecord> withdraw(String artifactId);
}

class ConsentApiImpl implements ConsentApi {
  ConsentApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<ConsentArtifact>> listCurrentArtifacts() {
    return _client.get<List<ConsentArtifact>>(
      '/api/v1/consent/current',
      decode: (json) =>
          ((json as Map<String, dynamic>)['artifacts'] as List<dynamic>).map((e) => ConsentArtifact.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<List<ConsentRecord>> listMyConsents() {
    return _client.get<List<ConsentRecord>>(
      '/api/v1/consent/me',
      decode: (json) =>
          ((json as Map<String, dynamic>)['records'] as List<dynamic>).map((e) => ConsentRecord.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<ConsentRecord> accept(String artifactId) {
    return _client.post<ConsentRecord>(
      '/api/v1/consent/$artifactId/accept',
      decode: (json) => ConsentRecord.fromJson((json as Map<String, dynamic>)['record'] as Map<String, dynamic>),
    );
  }

  @override
  Future<ConsentRecord> withdraw(String artifactId) {
    return _client.post<ConsentRecord>(
      '/api/v1/consent/$artifactId/withdraw',
      decode: (json) => ConsentRecord.fromJson((json as Map<String, dynamic>)['record'] as Map<String, dynamic>),
    );
  }
}
