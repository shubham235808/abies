import 'package:abies_mobile_management/core/api/api_exception.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ApiFieldIssue.fromJson', () {
    test('parses the backend\'s zod-error issue shape', () {
      final issue = ApiFieldIssue.fromJson({
        'path': ['email'],
        'message': 'Enter a valid email address',
      });

      expect(issue.path, ['email']);
      expect(issue.message, 'Enter a valid email address');
    });

    test('falls back to a safe default message when the field is missing', () {
      final issue = ApiFieldIssue.fromJson({'path': []});

      expect(issue.path, isEmpty);
      expect(issue.message, 'Invalid value');
    });
  });

  group('ApiException', () {
    test('classifies status codes without the caller re-deriving them', () {
      const unauthorized = ApiException(message: 'nope', statusCode: 401);
      const forbidden = ApiException(message: 'nope', statusCode: 403);
      const rateLimited = ApiException(message: 'nope', statusCode: 429);
      const transport = ApiException(message: 'offline', statusCode: -1);

      expect(unauthorized.isUnauthorized, isTrue);
      expect(forbidden.isForbidden, isTrue);
      expect(rateLimited.isRateLimited, isTrue);
      expect(transport.isTransportFailure, isTrue);
      expect(unauthorized.isForbidden, isFalse);
    });
  });
}
