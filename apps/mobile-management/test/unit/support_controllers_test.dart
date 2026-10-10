import 'package:abies_mobile_management/core/api/api_exception.dart';
import 'package:abies_mobile_management/features/auth/domain/auth_result.dart';
import 'package:abies_mobile_management/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile_management/features/support/domain/support_ticket.dart';
import 'package:abies_mobile_management/features/support/presentation/ticket_detail_controller.dart';
import 'package:abies_mobile_management/features/support/presentation/ticket_queue_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

ProviderContainer _container({required FakeAuthApi auth, required FakeSupportApi support}) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(auth),
    supportApiProvider.overrideWithValue(support),
  ]);
  addTearDown(container.dispose);
  return container;
}

FakeAuthApi _signedInAgent() => FakeAuthApi()..meResult = const MeResult(user: agentUser, mfaVerified: true);

void main() {
  group('TicketQueueController', () {
    test('loads the department queue once signed in', () async {
      final support = FakeSupportApi()..queueResult = [QueueTicket.fromJson(queueJson(id: 't1'))];
      final container = _container(auth: _signedInAgent(), support: support);

      final tickets = await container.read(ticketQueueControllerProvider.future);

      expect(tickets.map((t) => t.id), ['t1']);
      expect(support.queueCalls, 1);
    });

    test('never calls the queue endpoint while signed out', () async {
      final support = FakeSupportApi();
      final container = _container(auth: FakeAuthApi(), support: support);

      await expectLater(container.read(ticketQueueControllerProvider.future), throwsStateError);
      expect(support.queueCalls, 0);
    });

    test('refresh re-fetches and surfaces backend errors as an error state', () async {
      final support = FakeSupportApi();
      final container = _container(auth: _signedInAgent(), support: support);
      await container.read(ticketQueueControllerProvider.future);

      support.queueError = const ApiException(message: 'Role is not allowed for this operation', statusCode: 403);
      await container.read(ticketQueueControllerProvider.notifier).refresh();

      final state = container.read(ticketQueueControllerProvider);
      expect(state.hasError, isTrue);
      expect((state.error! as ApiException).isForbidden, isTrue);
      expect(support.queueCalls, 2);
    });
  });

  group('queue tabs and summary', () {
    final now = DateTime.utc(2026, 10, 10, 12);
    final tickets = [
      QueueTicket.fromJson(queueJson(id: 'open-unassigned-p1', priority: 'P1', responseDueAt: now.subtract(const Duration(minutes: 5)))),
      QueueTicket.fromJson(queueJson(id: 'mine-p2', priority: 'P2', status: 'IN_PROGRESS', assignedAgentUserId: agentUser.id, responseDueAt: now.add(const Duration(hours: 1)))),
      QueueTicket.fromJson(queueJson(id: 'waiting', status: 'WAITING_CUSTOMER', assignedAgentUserId: 'someone-else')),
      QueueTicket.fromJson(queueJson(id: 'resolved-today', status: 'RESOLVED', assignedAgentUserId: agentUser.id, resolvedAt: now.subtract(const Duration(hours: 1)), responseDueAt: now.subtract(const Duration(days: 1)))),
      QueueTicket.fromJson(queueJson(id: 'closed', status: 'CLOSED')),
    ];

    List<String> ids(QueueTab tab) =>
        tickets.where((t) => matchesQueueTab(t, tab, userId: agentUser.id, now: now.toLocal())).map((t) => t.id).toList();

    test('match the web support-queue-view tab rules', () {
      expect(ids(QueueTab.open), ['open-unassigned-p1', 'mine-p2', 'waiting']);
      expect(ids(QueueTab.unassigned), ['open-unassigned-p1', 'closed']);
      expect(ids(QueueTab.mine), ['mine-p2', 'resolved-today']);
      expect(ids(QueueTab.p1), ['open-unassigned-p1']);
      expect(ids(QueueTab.p2), ['mine-p2']);
      expect(ids(QueueTab.awaitingCustomer), ['waiting']);
      expect(ids(QueueTab.resolvedToday), ['resolved-today']);
    });

    test('summary counts open, SLA-breached (open only) and mine', () {
      final s = QueueSummary.of(tickets, userId: agentUser.id, now: now);
      expect(s.open, 3);
      expect(s.slaBreached, 1); // the resolved ticket's past due date doesn't count
      expect(s.mineOpen, 1);
    });
  });

  group('TicketDetailController', () {
    test('loads one ticket with its thread', () async {
      final support = FakeSupportApi()
        ..detail = detailJson(messages: [
          {
            'id': 'm1',
            'body': 'My booking failed',
            'createdAt': '2026-10-10T08:05:00.000Z',
            'authorUserId': 'pat-1',
            'author': {'id': 'pat-1', 'mobile': '+919000000003', 'role': 'PATIENT'},
          },
        ]);
      final container = _container(auth: _signedInAgent(), support: support);

      final t = await container.read(ticketDetailControllerProvider('t1').future);

      expect(t.subject, 'Subject t1');
      expect(t.linkedPatientName, 'Asha Rao');
      expect(t.messages.single.isFromStaff, isFalse);
    });

    test('reply posts the trimmed body, then re-fetches the real post-reply state', () async {
      final support = FakeSupportApi();
      final container = _container(auth: _signedInAgent(), support: support);
      await container.read(ticketDetailControllerProvider('t1').future);

      final error = await container.read(ticketDetailControllerProvider('t1').notifier).reply('  On it, checking now.  ');

      expect(error, isNull);
      expect(support.calls, ['reply:t1:On it, checking now.']);
      final t = container.read(ticketDetailControllerProvider('t1')).value!;
      expect(t.messages.single.body, 'On it, checking now.');
      expect(t.messages.single.isFromStaff, isTrue);
      expect(t.status, 'IN_PROGRESS'); // addMessage moves OPEN -> IN_PROGRESS server-side
    });

    test('an empty reply is rejected locally without a network call', () async {
      final support = FakeSupportApi();
      final container = _container(auth: _signedInAgent(), support: support);
      await container.read(ticketDetailControllerProvider('t1').future);

      final error = await container.read(ticketDetailControllerProvider('t1').notifier).reply('   ');

      expect(error, isNotNull);
      expect(support.calls, isEmpty);
    });

    test('a failed action returns the backend message and keeps the loaded ticket', () async {
      final support = FakeSupportApi()
        ..mutationError = const ApiException(message: 'This ticket is already claimed by another agent', statusCode: 409);
      final container = _container(auth: _signedInAgent(), support: support);
      await container.read(ticketDetailControllerProvider('t1').future);

      final error = await container.read(ticketDetailControllerProvider('t1').notifier).claim();

      expect(error, 'This ticket is already claimed by another agent');
      expect(container.read(ticketDetailControllerProvider('t1')).value?.id, 't1');
      expect(support.ticketCalls, 1);
    });

    test('claim assigns the ticket to me and invalidates the queue', () async {
      final support = FakeSupportApi();
      final container = _container(auth: _signedInAgent(), support: support);
      await container.read(ticketQueueControllerProvider.future);
      await container.read(ticketDetailControllerProvider('t1').future);
      expect(support.queueCalls, 1);

      expect(await container.read(ticketDetailControllerProvider('t1').notifier).claim(), isNull);

      final t = container.read(ticketDetailControllerProvider('t1')).value!;
      expect(t.assignedAgentUserId, agentUser.id);
      await container.read(ticketQueueControllerProvider.future);
      expect(support.queueCalls, 2);
    });

    test('updateStatus and triage send the right payloads', () async {
      final support = FakeSupportApi()..detail = detailJson(status: 'IN_PROGRESS', assignedAgentUserId: agentUser.id);
      final container = _container(auth: _signedInAgent(), support: support);
      final notifier = container.read(ticketDetailControllerProvider('t1').notifier);
      await container.read(ticketDetailControllerProvider('t1').future);

      expect(await notifier.updateStatus('WAITING_CUSTOMER'), isNull);
      expect(await notifier.triage(priority: 'P1'), isNull);
      expect(await notifier.triage(), isNotNull); // schema's refine: needs one of the two

      expect(support.calls, ['status:t1:WAITING_CUSTOMER', 'triage:t1:null:P1']);
      final t = container.read(ticketDetailControllerProvider('t1')).value!;
      expect(t.status, 'WAITING_CUSTOMER');
      expect(t.priority, 'P1');
    });

    test('triage that moves the ticket out of my department surfaces the 404 as an error state', () async {
      final support = FakeSupportApi();
      final container = _container(auth: _signedInAgent(), support: support);
      await container.read(ticketDetailControllerProvider('t1').future);

      support.ticketError = notFound; // canView() now false for this agent
      final error = await container.read(ticketDetailControllerProvider('t1').notifier).triage(department: 'TECH_SUPPORT');

      expect(error, isNull);
      final state = container.read(ticketDetailControllerProvider('t1'));
      expect(state.hasError, isTrue);
      expect((state.error! as ApiException).statusCode, 404);
    });
  });

  group('status transitions', () {
    test('only offer moves tickets.service.ts ALLOWED_TRANSITIONS accepts', () {
      expect(allowedNextStatuses('OPEN'), ['IN_PROGRESS']);
      expect(allowedNextStatuses('IN_PROGRESS'), ['WAITING_CUSTOMER', 'WAITING_PARTNER', 'RESOLVED']);
      expect(allowedNextStatuses('RESOLVED'), ['IN_PROGRESS', 'CLOSED']);
      expect(allowedNextStatuses('CLOSED'), ['IN_PROGRESS']);
    });
  });
}
