/// What this screen is actually for (2026-10-08, real incident): a
/// consumer-network component (confirmed, this session: Jio's own
/// transparent TLS interception, certificate CN=RILSELFCERT) can silently
/// intercept HTTPS to a real, correctly-configured backend. The app's own
/// strict TLS validation (no certificate pinning — see
/// docs/mobile/SECURITY-DESIGN.md §1) correctly rejects that connection,
/// but a user just sees "something failed" with no way to tell whether
/// that's their network, this app, or ABIES's own servers. This screen
/// exists so a user (or support) can see the actual certificate presented,
/// not just a generic failure.
enum ConnectionCheckStatus {
  /// Connected, and the server's certificate was trusted by the device's
  /// normal CA trust store — the expected, healthy outcome.
  trusted,

  /// A TLS connection was made, but the certificate was rejected — most
  /// often a network intercepting the connection (a transparent proxy, a
  /// captive portal, a misbehaving router), not a server-side problem.
  untrusted,

  /// Never got far enough to see a certificate at all — DNS failure,
  /// connection refused, timeout. A different class of problem than
  /// [untrusted]; worth telling apart so a user/support isn't sent down
  /// the wrong path.
  networkFailure,
}

class CertificateDetails {
  const CertificateDetails({required this.subject, required this.issuer, required this.validFrom, required this.validTo, required this.sha1Fingerprint});

  final String subject;
  final String issuer;
  final DateTime validFrom;
  final DateTime validTo;

  /// Hex, colon-separated, uppercase — matches the conventional
  /// `openssl x509 -fingerprint` display so a screenshot of this screen is
  /// directly comparable to a terminal-based check.
  final String sha1Fingerprint;

  /// Heuristic only, not a security control: does the issuer look like a
  /// real public CA for this domain, specifically Let's Encrypt (what
  /// abies.in is actually issued by). This never gates anything the app
  /// does — the TLS handshake itself already accepted or rejected the
  /// connection before this runs; it only shapes the plain-English message
  /// this screen shows.
  bool get issuerLooksLikeLetsEncrypt => issuer.contains("Let's Encrypt") || issuer.contains('ISRG');
}

class ConnectionCheckResult {
  const ConnectionCheckResult({required this.host, required this.port, required this.status, this.certificate, this.errorMessage});

  final String host;
  final int port;
  final ConnectionCheckStatus status;
  final CertificateDetails? certificate;
  final String? errorMessage;
}
