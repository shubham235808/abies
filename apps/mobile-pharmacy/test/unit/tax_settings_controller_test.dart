import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
import 'package:abies_pharmacy/features/tax/domain/tax_settings.dart';
import 'package:abies_pharmacy/features/tax/presentation/tax_settings_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

ProviderContainer _container(FakeTaxSettingsApi api) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(FakeAuthApi()..meResult = pharmacyUser),
    taxSettingsApiProvider.overrideWithValue(api),
  ]);
  addTearDown(container.dispose);
  return container;
}

Future<String?> _save(
  ProviderContainer c, {
  String legalBusinessName = 'Test Pharmacy LLP',
  String gstin = '27AAAAA0000A1Z5',
  String registeredState = 'Maharashtra',
  String stateCode = '27',
  String invoicePrefix = 'INV',
}) =>
    c.read(taxSettingsControllerProvider.notifier).save(
          legalBusinessName: legalBusinessName,
          gstin: gstin,
          registeredState: registeredState,
          stateCode: stateCode,
          invoicePrefix: invoicePrefix,
        );

void main() {
  group('TaxSettingsController', () {
    test('loads null when the pharmacy has not set up GST yet', () async {
      expect(await _container(FakeTaxSettingsApi()).read(taxSettingsControllerProvider.future), isNull);
    });

    test('save upper-cases GSTIN/prefix, trims, sends the exact schema body, and stores the result', () async {
      final api = FakeTaxSettingsApi();
      final c = _container(api);
      await c.read(taxSettingsControllerProvider.future);

      final error = await _save(c, legalBusinessName: ' Test Pharmacy LLP ', gstin: '27aaaaa0000a1z5', invoicePrefix: 'tp-1');

      expect(error, isNull);
      expect(api.lastSaveBody, {
        'legalBusinessName': 'Test Pharmacy LLP',
        'gstin': '27AAAAA0000A1Z5',
        'registeredState': 'Maharashtra',
        'stateCode': '27',
        'invoicePrefix': 'TP-1',
      });
      final state = c.read(taxSettingsControllerProvider).value!;
      expect(state.gstin, '27AAAAA0000A1Z5');
      expect(state.active, isTrue);
    });

    test('rejects what taxSettingsSchema would reject, before any call', () async {
      final api = FakeTaxSettingsApi();
      final c = _container(api);
      await c.read(taxSettingsControllerProvider.future);

      expect(await _save(c, gstin: '27AAAAA0000A1Y5'), 'Enter a valid 15-character GSTIN'); // 14th char must be Z
      expect(await _save(c, gstin: '27AAAAA0000A1Z'), 'Enter a valid 15-character GSTIN');
      expect(await _save(c, legalBusinessName: '  '), contains('legal business name'));
      expect(await _save(c, registeredState: ''), contains('registered state'));
      expect(await _save(c, stateCode: '12345'), contains('at most 4'));
      expect(await _save(c, invoicePrefix: 'INV/01'), 'Use only uppercase letters, numbers, and hyphens');
      expect(await _save(c, invoicePrefix: 'ABCDEFGHIJKLM'), contains('at most 12'));
      expect(api.lastSaveBody, isNull);
    });

    test('surfaces the backend refusal for a not-yet-approved pharmacy', () async {
      final api = FakeTaxSettingsApi()..saveError = const ApiException(message: 'Pharmacy profile not found or not approved', statusCode: 404);
      final c = _container(api);
      await c.read(taxSettingsControllerProvider.future);

      expect(await _save(c), 'Pharmacy profile not found or not approved');
      expect(c.read(taxSettingsControllerProvider).value, isNull);
    });
  });

  test('TaxSettings.fromJson reads the stored row including active', () {
    final s = TaxSettings.fromJson({
      'id': 'ts1',
      'pharmacyId': 'ph1',
      'legalBusinessName': 'A',
      'gstin': '27AAAAA0000A1Z5',
      'registeredState': 'Maharashtra',
      'stateCode': '27',
      'invoicePrefix': 'INV',
      'active': false,
    });
    expect(s.active, isFalse);
    expect(s.toJson().containsKey('active'), isFalse, reason: 'active is not part of taxSettingsSchema');
  });
}
