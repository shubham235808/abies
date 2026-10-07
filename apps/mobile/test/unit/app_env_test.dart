import 'package:abies_mobile/core/env/app_env.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AppEnv.fromDefine', () {
    test('defaults to dev with the real deployed hostname when no define is set', () {
      final env = AppEnv.fromDefine();

      expect(env.flavor, Flavor.dev);
      expect(env.baseUrl, 'https://dev.abies.in');
      expect(env.isProd, isFalse);
    });
  });
}
