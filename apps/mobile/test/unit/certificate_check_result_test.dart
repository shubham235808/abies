import 'package:abies_mobile/features/network_diagnostics/domain/certificate_check_result.dart';
import 'package:flutter_test/flutter_test.dart';

// The only non-trivial logic in this feature (the service itself is thin
// dart:io wiring, exercised manually against real hosts, not worth faking)
// — the heuristic that decides the plain-English verdict a user sees.
void main() {
  group('CertificateDetails.issuerLooksLikeLetsEncrypt', () {
    test('true for a real Let\'s Encrypt issuer string', () {
      final cert = CertificateDetails(
        subject: 'CN=abies.in',
        issuer: "C=US, O=Let's Encrypt, CN=YE1",
        validFrom: DateTime(2026, 10, 1),
        validTo: DateTime(2026, 12, 30),
        sha1Fingerprint: 'AA:BB',
      );
      expect(cert.issuerLooksLikeLetsEncrypt, isTrue);
    });

    test('true for an ISRG-issued chain even without the literal "Let\'s Encrypt" string', () {
      final cert = CertificateDetails(
        subject: 'CN=abies.in',
        issuer: 'C=US, O=Internet Security Research Group, CN=ISRG Root X2',
        validFrom: DateTime(2026, 10, 1),
        validTo: DateTime(2026, 12, 30),
        sha1Fingerprint: 'AA:BB',
      );
      expect(cert.issuerLooksLikeLetsEncrypt, isTrue);
    });

    test('false for an interception certificate (the real incident this screen was built for)', () {
      final cert = CertificateDetails(
        subject: 'CN=RILSELFCERT, OU=Reliance Project Vijay, O=Reliance Jio Infocomm Limited',
        issuer: 'CN=RILSELFCERT, OU=Reliance Project Vijay, O=Reliance Jio Infocomm Limited',
        validFrom: DateTime(2020, 1, 1),
        validTo: DateTime(2040, 1, 1),
        sha1Fingerprint: 'CC:DD',
      );
      expect(cert.issuerLooksLikeLetsEncrypt, isFalse);
    });

    test('false for an unrelated self-signed certificate', () {
      final cert = CertificateDetails(
        subject: 'CN=localhost',
        issuer: 'CN=localhost',
        validFrom: DateTime(2026, 1, 1),
        validTo: DateTime(2027, 1, 1),
        sha1Fingerprint: 'EE:FF',
      );
      expect(cert.issuerLooksLikeLetsEncrypt, isFalse);
    });
  });
}
