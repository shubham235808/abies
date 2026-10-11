import 'package:abies_mobile_management/core/api/api_exception.dart';
import 'package:abies_mobile_management/features/auth/domain/auth_result.dart';
import 'package:abies_mobile_management/features/auth/domain/session_user.dart';
import 'package:abies_mobile_management/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile_management/features/support/domain/support_ticket.dart';
import 'package:abies_mobile_management/features/support/presentation/ticket_detail_controller.dart';
import 'package:abies_mobile_management/features/support/presentation/ticket_queue_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

const SessionUser techUser = SessionUser(id: 'tech-1', mobile: '+919000000004', email: null, role: 'TECH_SUPPORT');

Future<ProviderContainer> _loaded(FakeSupportApi support, {SessionUser user = agentUser}) async {
  final auth = FakeAuthApi()..meResult = MeResult(user: user, mfaVerified: true);
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(auth),
    supportApiProvider.overrideWithValue(support),
  ]);
  addTearDown(container.dispose);
  await container.read(authControllerProvider.future);
  await container.read(ticketDetailControllerProvider('t1').future);
  return container;
}

TicketDetailController _notifier(ProviderContainer c) => c.read(ticketDetailControllerProvider('t1').notifier);
TicketDetail _ticket(ProviderContainer c) => c.read(ticketDetailControllerProvider('t1')).value!;

void main() {
  group('AttachmentUpload', () {
    test('maps only the types assertUploadAllowed accepts', () {
      expect(AttachmentUpload.mimeTypeFor('scan.PDF'), 'application/pdf');
      expect(AttachmentUpload.mimeTypeFor('photo.jpeg'), 'image/jpeg');
      expect(AttachmentUpload.mimeTypeFor('photo.jpg'), 'image/jpeg');
      expect(AttachmentUpload.mimeTypeFor('shot.png'), 'image/png');
      expect(AttachmentUpload.mimeTypeFor('notes.docx'), isNull);
      expect(AttachmentUpload.mimeTypeFor('noextension'), isNull);
    });

    test('rejects bad type, empty and oversize files before any upload', () {
      expect(pdfUpload.validationError, isNull);
      expect(const AttachmentUpload(path: 'x', filename: 'x.gif', mimeType: '', sizeBytes: 10).validationError, contains('PDF, JPG or PNG'));
      expect(const AttachmentUpload(path: 'x', filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 0).validationError, isNotNull);
      expect(
        const AttachmentUpload(path: 'x', filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: AttachmentUpload.maxBytes + 1).validationError,
        contains('10.0 MB'),
      );
    });
  });

  group('ticket detail parsing', () {
    test('parses message-bound and loose attachments, and refundable payments', () {
      final json = detailJson(
        messages: [
          {
            'id': 'm1',
            'body': 'Receipt attached',
            'createdAt': '2026-10-10T08:05:00.000Z',
            'author': {'id': 'pat-1', 'mobile': '+919000000003', 'role': 'PATIENT'},
            'attachments': [
              {'id': 'a1', 'messageId': 'm1', 'originalName': 'receipt.png', 'mimeType': 'image/png', 'sizeBytes': 5120},
            ],
          },
        ],
        refundablePayments: [
          paymentJson(amount: 1500, status: 'PARTIALLY_REFUNDED', refunds: [
            {'id': 'r1', 'amount': 500, 'status': 'COMPLETED'},
            {'id': 'r2', 'amount': 200, 'status': 'REJECTED'},
            {'id': 'r3', 'amount': 300, 'status': 'REQUESTED'},
          ]),
        ],
      );
      json['attachments'] = [
        {'id': 'a1', 'messageId': 'm1', 'originalName': 'receipt.png', 'mimeType': 'image/png', 'sizeBytes': 5120},
        {'id': 'a2', 'messageId': null, 'originalName': 'loose.pdf', 'mimeType': 'application/pdf', 'sizeBytes': 900},
      ];

      final t = TicketDetail.fromJson(json);

      expect(t.messages.single.attachments.single.originalName, 'receipt.png');
      expect(t.looseAttachments.map((a) => a.id), ['a2']);
      final p = t.refundablePayments.single;
      expect(p.refunds, hasLength(3));
      // Same as refundableBalance: everything except REJECTED is committed.
      expect(p.remaining, 1500 - 500 - 300);
    });

    test('a ticket from an older backend with no payments/attachments keys still parses', () {
      final json = detailJson()
        ..remove('refundablePayments')
        ..remove('attachments');
      final t = TicketDetail.fromJson(json);
      expect(t.refundablePayments, isEmpty);
      expect(t.looseAttachments, isEmpty);
    });

    test('formatBytes', () {
      expect(formatBytes(12), '12 B');
      expect(formatBytes(2048), '2 KB');
      expect(formatBytes(3 * 1024 * 1024 + 200 * 1024), '3.2 MB');
    });
  });

  group('TicketDetailController.replyWithAttachment', () {
    test('posts the message, then binds the file to the new message id, then re-fetches', () async {
      final support = FakeSupportApi();
      final container = await _loaded(support);

      final outcome = await _notifier(container).replyWithAttachment('  Here is the invoice.  ', pdfUpload);

      expect(outcome.error, isNull);
      expect(outcome.messageSent, isTrue);
      expect(support.calls, ['reply:t1:Here is the invoice.', 'attach:t1:receipt.pdf:m1']);
      final t = _ticket(container);
      expect(t.messages.single.attachments.single.originalName, 'receipt.pdf');
      expect(t.looseAttachments, isEmpty);
      expect(t.status, 'IN_PROGRESS');
    });

    test('requires a message alongside the file, without any network call', () async {
      final support = FakeSupportApi();
      final container = await _loaded(support);

      final outcome = await _notifier(container).replyWithAttachment('   ', pdfUpload);

      expect(outcome.messageSent, isFalse);
      expect(outcome.error, isNotNull);
      expect(support.calls, isEmpty);
    });

    test('an unacceptable file is refused locally, before the message is sent', () async {
      final support = FakeSupportApi();
      final container = await _loaded(support);
      const big = AttachmentUpload(path: 'x', filename: 'big.png', mimeType: 'image/png', sizeBytes: AttachmentUpload.maxBytes + 1);

      final outcome = await _notifier(container).replyWithAttachment('See attached', big);

      expect(outcome.messageSent, isFalse);
      expect(outcome.error, contains('limited to'));
      expect(support.calls, isEmpty);
    });

    test('a failed message send uploads nothing', () async {
      final support = FakeSupportApi()..mutationError = const ApiException(message: 'This ticket is closed — reopen it before replying', statusCode: 409);
      final container = await _loaded(support);

      final outcome = await _notifier(container).replyWithAttachment('See attached', pdfUpload);

      expect(outcome.messageSent, isFalse);
      expect(outcome.error, 'This ticket is closed — reopen it before replying');
      expect(support.calls, ['reply:t1:See attached']);
    });

    test('a failed upload after the message landed reports both facts and still shows the message', () async {
      final support = FakeSupportApi()..attachError = const ApiException(message: 'Something went wrong', statusCode: 500);
      final container = await _loaded(support);
      final ticketCallsBefore = support.ticketCalls;

      final outcome = await _notifier(container).replyWithAttachment('See attached', pdfUpload);

      expect(outcome.messageSent, isTrue); // screen must clear the text: re-sending it would duplicate it
      expect(outcome.error, contains('reply was sent, but the attachment was not'));
      expect(support.ticketCalls, ticketCallsBefore + 1);
      expect(_ticket(container).messages.single.body, 'See attached');
      expect(_ticket(container).messages.single.attachments, isEmpty);
    });
  });

  group('TicketDetailController.requestRefund', () {
    FakeSupportApi withPayment() => FakeSupportApi()
      ..detail = detailJson(refundablePayments: [
        paymentJson(amount: 1500, refunds: [
          {'id': 'r1', 'amount': 500, 'status': 'REQUESTED'},
        ]),
      ]);

    test('requests a refund within the balance, trims the reason, and re-fetches the real refund row', () async {
      final support = withPayment();
      final container = await _loaded(support);
      await container.read(ticketQueueControllerProvider.future);
      final queueCallsBefore = support.queueCalls;

      final error = await _notifier(container).requestRefund(paymentId: 'pay-1', amount: 1000, reason: '  Doctor no-show  ');

      expect(error, isNull);
      expect(support.calls, ['refund:pay-1:1000:Doctor no-show']);
      final p = _ticket(container).refundablePayments.single;
      expect(p.refunds.last.status, 'REQUESTED');
      expect(p.remaining, 0);
      await container.read(ticketQueueControllerProvider.future);
      expect(support.queueCalls, queueCallsBefore + 1);
    });

    test('a blank reason is omitted rather than sent as an empty string', () async {
      final support = withPayment();
      final container = await _loaded(support);

      expect(await _notifier(container).requestRefund(paymentId: 'pay-1', amount: 100, reason: '   '), isNull);
      expect(support.calls, ['refund:pay-1:100:null']);
    });

    test('amounts outside 1..remaining are refused locally', () async {
      final support = withPayment();
      final container = await _loaded(support);

      expect(await _notifier(container).requestRefund(paymentId: 'pay-1', amount: 1001), contains('₹1000'));
      expect(await _notifier(container).requestRefund(paymentId: 'pay-1', amount: 0), isNotNull);
      expect(await _notifier(container).requestRefund(paymentId: 'unknown', amount: 10), isNotNull);
      expect(support.calls, isEmpty);
    });

    test('roles POST /api/v1/refunds rejects are refused locally', () async {
      final support = withPayment();
      final container = await _loaded(support, user: techUser);

      final error = await _notifier(container).requestRefund(paymentId: 'pay-1', amount: 100);

      expect(error, contains('Customer Support and Admin'));
      expect(support.calls, isEmpty);
    });

    test('ADMIN may request too', () async {
      final support = withPayment();
      final container = await _loaded(support, user: adminUser);

      expect(await _notifier(container).requestRefund(paymentId: 'pay-1', amount: 100), isNull);
      expect(support.calls, ['refund:pay-1:100:null']);
    });

    test('a server refusal is returned and the loaded ticket kept', () async {
      final support = withPayment()..mutationError = const ApiException(message: 'Amount exceeds the refundable balance (₹0 remaining)', statusCode: 400);
      final container = await _loaded(support);

      final error = await _notifier(container).requestRefund(paymentId: 'pay-1', amount: 500);

      expect(error, 'Amount exceeds the refundable balance (₹0 remaining)');
      expect(_ticket(container).refundablePayments.single.refunds, hasLength(1));
    });
  });

  test('refund request roles match the route exactly', () {
    expect(refundRequestRoles, {'CUSTOMER_SUPPORT', 'ADMIN'});
    for (final role in ['TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR', 'PATIENT', null]) {
      expect(canRequestRefunds(role), isFalse, reason: '$role');
    }
  });
}
