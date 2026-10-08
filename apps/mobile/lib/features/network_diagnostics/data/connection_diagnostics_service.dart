import 'dart:async';
import 'dart:io';

import '../domain/certificate_check_result.dart';

/// Performs a real TLS handshake against [host]:[port] and reports exactly
/// what certificate was presented — the one thing a browser's/JS fetch
/// API cannot do (certificate details aren't exposed to web JavaScript at
/// all), which is why this has to be a native screen, not a web page.
///
/// Deliberately bypasses [ApiClient]/dio entirely and talks to
/// [SecureSocket] directly: this needs to see the certificate even when
/// it's untrusted (dio/HttpClient would just throw a HandshakeException
/// with no certificate attached), via [SecureSocket.connect]'s
/// `onBadCertificate` callback, which hands over the actual
/// [X509Certificate] before deciding whether to reject it. The callback
/// always returns false — this never actually trusts an unexpected
/// certificate, it only inspects it on the way to a correct rejection.
class ConnectionDiagnosticsService {
  Future<ConnectionCheckResult> check(String host, {int port = 443}) async {
    X509Certificate? seenCertificate;
    try {
      final socket = await SecureSocket.connect(
        host,
        port,
        timeout: const Duration(seconds: 10),
        onBadCertificate: (cert) {
          seenCertificate = cert;
          return false; // Never actually trust it — this only inspects.
        },
      );
      // Reaching here means the handshake succeeded with a certificate the
      // platform's own CA trust store already accepted.
      final cert = socket.peerCertificate;
      await socket.close();
      if (cert == null) {
        return ConnectionCheckResult(host: host, port: port, status: ConnectionCheckStatus.networkFailure, errorMessage: 'Connected, but no certificate was reported.');
      }
      return ConnectionCheckResult(host: host, port: port, status: ConnectionCheckStatus.trusted, certificate: _toDetails(cert));
    } on HandshakeException catch (e) {
      if (seenCertificate != null) {
        return ConnectionCheckResult(host: host, port: port, status: ConnectionCheckStatus.untrusted, certificate: _toDetails(seenCertificate!), errorMessage: e.message);
      }
      return ConnectionCheckResult(host: host, port: port, status: ConnectionCheckStatus.networkFailure, errorMessage: e.message);
    } on SocketException catch (e) {
      return ConnectionCheckResult(host: host, port: port, status: ConnectionCheckStatus.networkFailure, errorMessage: e.message);
    } on TimeoutException {
      return ConnectionCheckResult(host: host, port: port, status: ConnectionCheckStatus.networkFailure, errorMessage: 'Connection timed out.');
    } catch (e) {
      return ConnectionCheckResult(host: host, port: port, status: ConnectionCheckStatus.networkFailure, errorMessage: e.toString());
    }
  }

  CertificateDetails _toDetails(X509Certificate cert) {
    return CertificateDetails(
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: cert.startValidity,
      validTo: cert.endValidity,
      sha1Fingerprint: cert.sha1.map((b) => b.toRadixString(16).padLeft(2, '0')).join(':').toUpperCase(),
    );
  }
}
