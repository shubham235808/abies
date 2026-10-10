import 'package:abies_diagnostics/features/auth/presentation/auth_controller.dart';
import 'package:abies_diagnostics/features/orders/domain/lab_order.dart';
import 'package:abies_diagnostics/features/orders/presentation/lab_orders_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

LabOrderSummary summary(String id, String status, {String? scheduledAt, Map<String, dynamic>? report}) =>
    LabOrderSummary.fromJson(orderJson(id: id, status: status, scheduledAt: scheduledAt, report: report));

void main() {
  late FakeLabOrdersApi api;
  late ProviderContainer container;

  setUp(() {
    api = FakeLabOrdersApi();
    container = ProviderContainer(overrides: [
      labOrdersApiProvider.overrideWithValue(api),
      sessionUserIdProvider.overrideWithValue('lab-u1'),
    ]);
  });
  tearDown(() => container.dispose());

  group('LabOrderSummary / LabOrderDetail parsing', () {
    test('derives patient name, items and collection mode from the real listMineAsLab shape', () {
      final o = summary('o1', 'SCHEDULED');
      expect(o.patientName, 'Asha Rao');
      expect(o.itemNames, ['CBC']);
      expect(o.isHomeCollection, isTrue);
      expect(o.status.nextAction, LabOrderAction.collectSample);
    });

    test('falls back to the patient mobile when there is no profile name', () {
      final json = orderJson(id: 'o1', status: 'SCHEDULED');
      json['patientUser'] = {'mobile': '+919876543210', 'patientProfile': null};
      expect(LabOrderSummary.fromJson(json).patientName, '+919876543210');
    });

    test('status machine: only active statuses have a next action', () {
      expect(LabOrderStatus.parse('SAMPLE_COLLECTED').nextAction, LabOrderAction.startProcessing);
      expect(LabOrderStatus.parse('PROCESSING').nextAction, LabOrderAction.releaseReport);
      expect(LabOrderStatus.parse('COMPLETED').nextAction, isNull);
      expect(LabOrderStatus.parse('CANCELLED').nextAction, isNull);
      expect(LabOrderStatus.parse('SOMETHING_NEW'), LabOrderStatus.unknown);
    });

    test('report upload MIME types match the server allow-list', () {
      expect(ReportUpload.mimeTypeFor('r.PDF'), 'application/pdf');
      expect(ReportUpload.mimeTypeFor('r.jpeg'), 'image/jpeg');
      expect(ReportUpload.mimeTypeFor('r.png'), 'image/png');
      expect(ReportUpload.mimeTypeFor('r.docx'), isNull);
      expect(ReportUpload.mimeTypeFor('noext'), isNull);
    });
  });

  group('dashboard buckets and filter', () {
    test('counts each pipeline stage and unacknowledged critical results', () {
      final now = DateTime.utc(2026, 10, 10, 12);
      final orders = [
        summary('a', 'SCHEDULED', scheduledAt: DateTime.utc(2026, 10, 10, 14).toIso8601String()),
        summary('b', 'SCHEDULED', scheduledAt: DateTime.utc(2026, 10, 8, 9).toIso8601String()),
        summary('c', 'SAMPLE_COLLECTED'),
        summary('d', 'PROCESSING'),
        summary('e', 'COMPLETED', report: {'criticalFlag': true, 'doctorAcknowledgedAt': null}),
        summary('f', 'COMPLETED', report: {'criticalFlag': true, 'doctorAcknowledgedAt': '2026-10-09T00:00:00Z'}),
        summary('g', 'CANCELLED'),
      ];
      final b = LabOrderBuckets(orders, now: now);
      expect(b.toCollect, 2);
      expect(b.overdueCollections, 1);
      expect(b.awaitingProcessing, 1);
      expect(b.processing, 1);
      expect(b.criticalUnacknowledged, 1);

      expect(filterOrders(orders, OrderFilter.active).map((o) => o.id), ['a', 'b', 'c', 'd']);
      expect(filterOrders(orders, OrderFilter.completed).map((o) => o.id), ['e', 'f']);
      expect(filterOrders(orders, OrderFilter.all), hasLength(7));
    });
  });

  group('LabOrdersController', () {
    test('loads GET /labs/me/orders', () async {
      api.summaries = [summary('o1', 'SCHEDULED')];
      final orders = await container.read(labOrdersControllerProvider.future);
      expect(orders.single.id, 'o1');
      expect(api.listCalls, 1);
    });
  });

  group('LabOrderDetailController — fulfilment walk-through', () {
    test('walks SCHEDULED -> SAMPLE_COLLECTED -> PROCESSING -> COMPLETED, re-reading the order each time', () async {
      api.statuses['o1'] = 'SCHEDULED';
      final provider = labOrderDetailControllerProvider('o1');
      expect((await container.read(provider.future)).status, LabOrderStatus.scheduled);
      // Keep the list provider alive so its invalidation is observable.
      final listSub = container.listen(labOrdersControllerProvider, (_, __) {});
      await container.read(labOrdersControllerProvider.future);
      final listCallsBefore = api.listCalls;

      final ctrl = container.read(provider.notifier);
      expect(await ctrl.markSampleCollected(collectorName: 'Ramesh', sampleBarcode: 'BC-1'), isNull);
      var detail = container.read(provider).value!;
      expect(detail.status, LabOrderStatus.sampleCollected);
      expect(detail.sampleCollection?.collectorName, 'Ramesh');
      expect(detail.sampleCollection?.sampleBarcode, 'BC-1');

      expect(await ctrl.startProcessing(), isNull);
      expect(container.read(provider).value!.status, LabOrderStatus.processing);

      const upload = ReportUpload(path: '/tmp/r.pdf', filename: 'r.pdf', mimeType: 'application/pdf');
      expect(await ctrl.releaseReport(criticalFlag: true, file: upload), isNull);
      detail = container.read(provider).value!;
      expect(detail.status, LabOrderStatus.completed);
      expect(detail.report?.criticalFlag, isTrue);
      expect(detail.report?.hasDocument, isTrue);
      expect(api.lastUpload?.mimeType, 'application/pdf');

      expect(api.calls, ['sample-collected', 'processing', 'report']);
      await container.read(labOrdersControllerProvider.future);
      expect(api.listCalls, greaterThan(listCallsBefore), reason: 'dashboard list is refreshed after transitions');
      listSub.close();
    });

    test('an out-of-order transition returns the server message and shows the real current status', () async {
      api.statuses['o1'] = 'SCHEDULED';
      final provider = labOrderDetailControllerProvider('o1');
      await container.read(provider.future);
      // Another device already moved it on.
      api.statuses['o1'] = 'PROCESSING';

      final error = await container.read(provider.notifier).markSampleCollected();

      expect(error, 'Only a scheduled order can have its sample collected');
      expect(container.read(provider).value!.status, LabOrderStatus.processing);
    });

    test('a report can be released without a file (backend allows file: null)', () async {
      api.statuses['o1'] = 'PROCESSING';
      final provider = labOrderDetailControllerProvider('o1');
      await container.read(provider.future);
      expect(await container.read(provider.notifier).releaseReport(criticalFlag: false), isNull);
      final detail = container.read(provider).value!;
      expect(detail.status, LabOrderStatus.completed);
      expect(detail.report?.hasDocument, isFalse);
    });
  });
}
