import 'package:abies_diagnostics/core/api/api_exception.dart';
import 'package:abies_diagnostics/features/auth/presentation/auth_controller.dart';
import 'package:abies_diagnostics/features/catalogue/domain/catalogue.dart';
import 'package:abies_diagnostics/features/catalogue/presentation/catalogue_controller.dart';
import 'package:abies_diagnostics/features/lab_profile/domain/lab_profile.dart';
import 'package:abies_diagnostics/features/lab_profile/presentation/lab_profile_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  group('LabProfile', () {
    test('parses GET /labs/me and reports what blocks submission', () {
      final lab = LabProfile.fromJson({
        'id': 'l1',
        'userId': 'lab-u1',
        'name': null,
        'licenseNumbers': <String>[],
        'serviceCities': ['Pune'],
        'homeCollectionSupported': true,
        'verificationStatus': 'DRAFT',
        'rejectionReason': null,
      });
      expect(lab.isEditable, isTrue);
      expect(lab.isApproved, isFalse);
      expect(lab.missingForSubmission, ['lab name', 'at least one license number']);
    });

    test('only DRAFT and REJECTED are editable', () {
      for (final s in ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED']) {
        expect(LabProfile(id: 'l', verificationStatus: s).isEditable, isFalse, reason: s);
      }
      expect(const LabProfile(id: 'l', verificationStatus: 'REJECTED').isEditable, isTrue);
    });
  });

  group('LabProfileController', () {
    late FakeLabProfileApi api;
    late ProviderContainer container;

    setUp(() {
      api = FakeLabProfileApi(const LabProfile(id: 'l1', verificationStatus: 'DRAFT'));
      container = ProviderContainer(overrides: [
        labProfileApiProvider.overrideWithValue(api),
        sessionUserIdProvider.overrideWithValue('lab-u1'),
      ]);
    });
    tearDown(() => container.dispose());

    test('save splits one-per-line fields like the web form and updates state', () async {
      await container.read(labProfileControllerProvider.future);
      final error = await container.read(labProfileControllerProvider.notifier).save(
            name: 'City Diagnostics',
            licenseNumbersText: 'NABL-123\n\n  MH-LAB-9 \n',
            serviceCitiesText: 'Pune\nMumbai',
            homeCollectionSupported: true,
          );
      expect(error, isNull);
      expect(api.lastUpdate?['licenseNumbers'], ['NABL-123', 'MH-LAB-9']);
      expect(container.read(labProfileControllerProvider).value?.missingForSubmission, isEmpty);
    });

    test('submit requires the declaration and moves to SUBMITTED', () async {
      await container.read(labProfileControllerProvider.future);
      final ctrl = container.read(labProfileControllerProvider.notifier);
      expect(await ctrl.submit(declarationAccepted: false), 'The partner declaration must be accepted');
      expect(await ctrl.submit(declarationAccepted: true), isNull);
      expect(container.read(labProfileControllerProvider).value?.verificationStatus, 'SUBMITTED');
    });

    test('submit surfaces the server validation message', () async {
      api.submitError = const ApiException(message: 'Complete the following before submitting: lab name', statusCode: 400);
      await container.read(labProfileControllerProvider.future);
      expect(await container.read(labProfileControllerProvider.notifier).submit(declarationAccepted: true),
          'Complete the following before submitting: lab name');
    });
  });

  group('Catalogue payloads match catalogue.schemas.ts', () {
    test('create omits empty optionals; update clears them with empty strings, never null', () {
      const input = TestInput(code: ' CBC ', name: 'Complete Blood Count', price: 400, description: '  ', turnaroundHours: 24);
      expect(input.toJson(), {'code': 'CBC', 'name': 'Complete Blood Count', 'price': 400, 'turnaroundHours': 24});
      final update = input.toJson(forUpdate: true);
      expect(update['description'], '');
      expect(update['sampleType'], '');
      expect(update.values.contains(null), isFalse);
    });

    test('package payload carries testIds', () {
      const p = PackageInput(name: 'Full Body', price: 999, testIds: ['t1', 't2']);
      expect(p.toJson(), {'name': 'Full Body', 'price': 999, 'testIds': ['t1', 't2']});
    });

    test('parses a package with its joined tests', () {
      final p = LabPackage.fromJson({
        'id': 'p1',
        'name': 'Full Body',
        'price': 999,
        'active': true,
        'description': null,
        'tests': [
          {'packageId': 'p1', 'testId': 't1', 'test': {'id': 't1', 'name': 'CBC'}},
        ],
      });
      expect(p.testIds, ['t1']);
      expect(p.testNames, ['CBC']);
    });
  });

  group('CatalogueController', () {
    late FakeCatalogueApi api;
    late ProviderContainer container;

    setUp(() {
      api = FakeCatalogueApi();
      container = ProviderContainer(overrides: [
        catalogueApiProvider.overrideWithValue(api),
        sessionUserIdProvider.overrideWithValue('lab-u1'),
      ]);
    });
    tearDown(() => container.dispose());

    test('create, toggle, package, delete — each re-reads the catalogue', () async {
      await container.read(catalogueControllerProvider.future);
      final ctrl = container.read(catalogueControllerProvider.notifier);

      expect(await ctrl.saveTest(const TestInput(code: 'CBC', name: 'CBC', price: 400)), isNull);
      var cat = container.read(catalogueControllerProvider).value!;
      expect(cat.tests.single.code, 'CBC');
      final testId = cat.tests.single.id;

      expect(await ctrl.setTestActive(testId, false), isNull);
      expect(container.read(catalogueControllerProvider).value!.tests.single.active, isFalse);
      expect(api.patches.last, {'active': false});

      expect(await ctrl.savePackage(PackageInput(name: 'Pack', price: 900, testIds: [testId])), isNull);
      expect(container.read(catalogueControllerProvider).value!.packages.single.testIds, [testId]);

      expect(await ctrl.deleteTest(testId), isNull);
      cat = container.read(catalogueControllerProvider).value!;
      expect(cat.tests, isEmpty);
      expect(cat.packages.single.testIds, isEmpty);
    });

    test('a package with no tests is refused before any request', () async {
      await container.read(catalogueControllerProvider.future);
      final error = await container.read(catalogueControllerProvider.notifier).savePackage(const PackageInput(name: 'X', price: 1, testIds: []));
      expect(error, 'Pick at least one test for this package');
      expect(api.packages, isEmpty);
    });

    test('a duplicate code surfaces the server message and leaves state intact', () async {
      await container.read(catalogueControllerProvider.future);
      api.createError = const ApiException(message: 'This lab already has a test with this code', statusCode: 400);
      final error = await container.read(catalogueControllerProvider.notifier).saveTest(const TestInput(code: 'CBC', name: 'CBC', price: 1));
      expect(error, 'This lab already has a test with this code');
      expect(container.read(catalogueControllerProvider).hasValue, isTrue);
    });
  });
}
