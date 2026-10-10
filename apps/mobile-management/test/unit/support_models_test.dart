import 'package:abies_mobile_management/features/support/domain/support_ticket.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  test('QueueTicket parses a real listQueue row, including the sla snapshot', () {
    final due = DateTime.utc(2026, 10, 10, 12);
    final t = QueueTicket.fromJson(queueJson(id: 'x', assignedAgentUserId: 'agent-1', responseDueAt: due));
    expect(t.requesterMobile, '+919000000003');
    expect(t.assignedAgentMobile, '+919000000001');
    expect(t.sla?.responseDueAt, due);
    expect(t.sla?.responseTargetMinutes, 240);
  });

  test('a null sla column parses to no SLA, never a fabricated deadline', () {
    final t = QueueTicket.fromJson(queueJson(id: 'x'));
    expect(t.sla, isNull);
    expect(slaStateOf(status: t.status, sla: t.sla, now: DateTime.now()), SlaState.none);
  });

  test('slaStateOf: breached only while open and past due', () {
    final now = DateTime.utc(2026, 10, 10, 12);
    final past = TicketSla(responseDueAt: now.subtract(const Duration(minutes: 1)));
    final future = TicketSla(responseDueAt: now.add(const Duration(minutes: 1)));
    expect(slaStateOf(status: 'OPEN', sla: past, now: now), SlaState.breached);
    expect(slaStateOf(status: 'IN_PROGRESS', sla: future, now: now), SlaState.onTrack);
    expect(slaStateOf(status: 'RESOLVED', sla: past, now: now), SlaState.closed);
  });

  test('TicketDetail tolerates a deleted message author and a missing patient profile', () {
    final json = detailJson(messages: [
      {'id': 'm1', 'body': 'hi', 'createdAt': '2026-10-10T08:00:00.000Z', 'authorUserId': null, 'author': null},
    ]);
    json['linkedPatient'] = {'id': 'p', 'mobile': '+91', 'patientProfile': null};
    final t = TicketDetail.fromJson(json);
    expect(t.messages.single.authorMobile, isNull);
    expect(t.messages.single.isFromStaff, isFalse);
    expect(t.linkedPatientName, isNull);
    expect(t.linkedPatientMobile, '+91');
  });

  test('humanizeEnum and categoryLabel', () {
    expect(humanizeEnum('WAITING_CUSTOMER'), 'Waiting customer');
    expect(categoryLabel('CLINICAL_CONCERN'), 'Clinical safety concern');
    expect(categoryLabel('SOMETHING_NEW'), 'Something new');
  });
}
