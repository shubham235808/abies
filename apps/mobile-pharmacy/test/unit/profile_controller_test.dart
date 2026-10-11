import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
import 'package:abies_pharmacy/features/home/domain/pharmacy_profile.dart';
import 'package:abies_pharmacy/features/home/presentation/home_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

ProviderContainer _container(FakePharmacyProfileApi api) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(FakeAuthApi()..meResult = pharmacyUser),
    pharmacyProfileApiProvider.overrideWithValue(api),
  ]);
  addTearDown(container.dispose);
  return container;
}

PharmacyProfile _profile({String status = 'DRAFT', String? name, List<String> licenses = const [], List<String> areas = const []}) =>
    PharmacyProfile.fromJson(pharmacyJson(status: status, name: name, licenses: licenses, areas: areas));

void main() {
  group('PharmacyProfile', () {
    test('parses license numbers and service areas', () {
      final p = _profile(name: 'Shree Pharmacy', licenses: ['DL-1'], areas: ['Pune']);
      expect(p.licenseNumbers, ['DL-1']);
      expect(p.serviceAreas, ['Pune']);
    });

    test('only DRAFT and REJECTED are editable (editableStatus in pharmacies.service.ts)', () {
      for (final s in ['DRAFT', 'REJECTED']) {
        expect(_profile(status: s).isEditable, isTrue, reason: s);
      }
      for (final s in ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED']) {
        expect(_profile(status: s).isEditable, isFalse, reason: s);
      }
    });

    test('missingForSubmission lists what submitPharmacy would refuse over', () {
      expect(_profile().missingForSubmission, ['pharmacy name', 'at least one license number', 'at least one service area']);
      expect(_profile(name: 'X', licenses: ['L'], areas: ['A']).missingForSubmission, isEmpty);
    });
  });

  test('splitLines trims and drops blank lines, like the web textarea parsing', () {
    expect(splitLines('  DL-1 \n\n DL-2\n  '), ['DL-1', 'DL-2']);
  });

  group('PharmacyProfileController', () {
    test('loads the profile once signed in', () async {
      final api = FakePharmacyProfileApi(_profile(name: 'Shree'));
      expect((await _container(api).read(pharmacyProfileProvider.future)).name, 'Shree');
    });

    test('save sends trimmed fields and replaces state with the server row', () async {
      final api = FakePharmacyProfileApi(_profile());
      final container = _container(api);
      await container.read(pharmacyProfileProvider.future);

      final error = await container.read(pharmacyProfileProvider.notifier).save(
            name: '  Shree Pharmacy ',
            licenseNumbers: ['DL-1'],
            serviceAreas: ['Pune', 'Mumbai'],
          );

      expect(error, isNull);
      expect(api.lastUpdate, {'name': 'Shree Pharmacy', 'licenseNumbers': ['DL-1'], 'serviceAreas': ['Pune', 'Mumbai']});
      final state = container.read(pharmacyProfileProvider).value!;
      expect(state.name, 'Shree Pharmacy');
      expect(state.serviceAreas, ['Pune', 'Mumbai']);
    });

    test('a blank name is omitted, not sent as "" (schema needs min(1))', () async {
      final api = FakePharmacyProfileApi(_profile());
      final container = _container(api);
      await container.read(pharmacyProfileProvider.future);

      await container.read(pharmacyProfileProvider.notifier).save(name: '   ', licenseNumbers: [], serviceAreas: []);

      expect(api.lastUpdate!['name'], isNull);
    });

    test('save refuses locally when the profile is locked or a field is out of bounds', () async {
      final locked = FakePharmacyProfileApi(_profile(status: 'SUBMITTED', name: 'X'));
      final c1 = _container(locked);
      await c1.read(pharmacyProfileProvider.future);
      expect(await c1.read(pharmacyProfileProvider.notifier).save(name: 'Y', licenseNumbers: [], serviceAreas: []), contains('locked'));
      expect(locked.lastUpdate, isNull);

      final draft = FakePharmacyProfileApi(_profile());
      final c2 = _container(draft);
      await c2.read(pharmacyProfileProvider.future);
      final notifier = c2.read(pharmacyProfileProvider.notifier);
      expect(await notifier.save(name: 'x' * 201, licenseNumbers: [], serviceAreas: []), contains('at most 200'));
      expect(await notifier.save(name: 'X', licenseNumbers: List.filled(21, 'L'), serviceAreas: []), contains('at most 20 license'));
      expect(await notifier.save(name: 'X', licenseNumbers: ['L' * 101], serviceAreas: []), contains('too long'));
      expect(draft.lastUpdate, isNull);
    });

    test('save surfaces the backend error and keeps the old state', () async {
      final api = FakePharmacyProfileApi(_profile(name: 'Old'))
        ..updateError = const ApiException(message: 'Pharmacy details are locked', statusCode: 403);
      final container = _container(api);
      await container.read(pharmacyProfileProvider.future);

      final error = await container.read(pharmacyProfileProvider.notifier).save(name: 'New', licenseNumbers: [], serviceAreas: []);

      expect(error, 'Pharmacy details are locked');
      expect(container.read(pharmacyProfileProvider).value!.name, 'Old');
    });

    test('submit requires the declaration', () async {
      final api = FakePharmacyProfileApi(_profile(name: 'X', licenses: ['L'], areas: ['A']));
      final container = _container(api);
      await container.read(pharmacyProfileProvider.future);

      expect(await container.read(pharmacyProfileProvider.notifier).submit(declarationAccepted: false), contains('declaration'));
      expect(api.submitCalls, 0);
    });

    test('submit names what is missing, in the backend wording, without calling it', () async {
      final api = FakePharmacyProfileApi(_profile(name: 'X'));
      final container = _container(api);
      await container.read(pharmacyProfileProvider.future);

      final error = await container.read(pharmacyProfileProvider.notifier).submit(declarationAccepted: true);

      expect(error, 'Complete the following before submitting: at least one license number, at least one service area');
      expect(api.submitCalls, 0);
    });

    test('submit moves a complete DRAFT to SUBMITTED', () async {
      final api = FakePharmacyProfileApi(_profile(name: 'X', licenses: ['L'], areas: ['A']));
      final container = _container(api);
      await container.read(pharmacyProfileProvider.future);

      final error = await container.read(pharmacyProfileProvider.notifier).submit(declarationAccepted: true);

      expect(error, isNull);
      expect(api.submitCalls, 1);
      final state = container.read(pharmacyProfileProvider).value!;
      expect(state.verificationStatus, 'SUBMITTED');
      expect(state.isEditable, isFalse);
    });

    test('a REJECTED profile can be resubmitted; an already-SUBMITTED one cannot', () async {
      final rejected = FakePharmacyProfileApi(_profile(status: 'REJECTED', name: 'X', licenses: ['L'], areas: ['A']));
      final c1 = _container(rejected);
      await c1.read(pharmacyProfileProvider.future);
      expect(await c1.read(pharmacyProfileProvider.notifier).submit(declarationAccepted: true), isNull);

      final submitted = FakePharmacyProfileApi(_profile(status: 'SUBMITTED', name: 'X', licenses: ['L'], areas: ['A']));
      final c2 = _container(submitted);
      await c2.read(pharmacyProfileProvider.future);
      expect(await c2.read(pharmacyProfileProvider.notifier).submit(declarationAccepted: true), 'Application is not in a submittable state');
      expect(submitted.submitCalls, 0);
    });
  });
}
