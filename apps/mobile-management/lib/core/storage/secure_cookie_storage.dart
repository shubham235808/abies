import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists `package:cookie_jar`'s cookie data through [FlutterSecureStorage]
/// (Android Keystore / iOS Keychain) instead of its default plain-file
/// storage — the session cookie is a bearer credential and is treated like
/// one (docs/mobile/SECURITY-DESIGN.md §2), even though HTTP transports it as
/// a cookie.
///
/// Implements `cookie_jar`'s `Storage` interface — checked against
/// cookie_jar 4.0.9's actual `abstract class Storage`
/// (`package:cookie_jar/src/storage.dart`) after `flutter pub get` ran; see
/// apps/mobile/README.md "Status" for what else in this app is still
/// unverified.
class SecureCookieStorage implements Storage {
  SecureCookieStorage({FlutterSecureStorage? secureStorage})
      : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _secureStorage;

  @override
  Future<void> init(bool persistSession, bool ignoreExpires) async {
    // Nothing to do: FlutterSecureStorage needs no explicit init.
  }

  @override
  Future<String?> read(String key) => _secureStorage.read(key: _prefixed(key));

  @override
  Future<void> write(String key, String value) => _secureStorage.write(key: _prefixed(key), value: value);

  @override
  Future<void> delete(String key) => _secureStorage.delete(key: _prefixed(key));

  @override
  Future<void> deleteAll(List<String> keys) async {
    for (final key in keys) {
      await delete(key);
    }
  }

  String _prefixed(String key) => 'abies_ops_cookie_$key';
}
