import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../auth/domain/session_user.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/support_ticket.dart';
import 'ticket_queue_controller.dart';

/// What happened to a reply sent with an attachment. The message and the
/// file are two separate requests (`messages`, then `attachments` bound to
/// the new message's id) — the backend has no single call that does both —
/// so the second can fail after the first already landed. [messageSent]
/// tells the screen whether to clear the typed text (it was delivered, and
/// re-sending it would duplicate it) even when [error] is set.
class ReplyOutcome {
  const ReplyOutcome({required this.messageSent, this.error});

  final bool messageSent;
  final String? error;
}

/// One ticket's thread + staff actions. Every action follows apps/mobile's
/// `AppointmentsController` convention: returns null on success or the
/// backend's user-facing message on failure (e.g. "This ticket is already
/// claimed by another agent", "Cannot move a OPEN ticket to RESOLVED"),
/// without replacing the loaded ticket with an error state. On success the
/// ticket is re-fetched (mutation responses are thin — see [SupportApi]) and
/// the queue is invalidated so its rows reflect the change on return.
class TicketDetailController extends FamilyAsyncNotifier<TicketDetail, String> {
  @override
  Future<TicketDetail> build(String ticketId) {
    return ref.read(supportApiProvider).ticket(ticketId);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(supportApiProvider).ticket(arg));
  }

  Future<String?> reply(String body) {
    final trimmed = body.trim();
    if (trimmed.isEmpty) return Future.value('Write a reply first.');
    if (trimmed.length > 5000) return Future.value('Replies are limited to 5000 characters.');
    return _run(() => ref.read(supportApiProvider).reply(arg, trimmed));
  }

  /// Reply + one file. A message is required alongside the file: an
  /// attachment uploaded on its own (the route allows `messageId` to be
  /// omitted) creates no message, so the customer gets no
  /// `support.new_message` notification and the ticket's status/
  /// lastResponseAt don't move — a file the customer is never told about.
  Future<ReplyOutcome> replyWithAttachment(String body, AttachmentUpload file) async {
    final trimmed = body.trim();
    if (trimmed.isEmpty) return const ReplyOutcome(messageSent: false, error: 'Add a short message to go with the attachment.');
    if (trimmed.length > 5000) return const ReplyOutcome(messageSent: false, error: 'Replies are limited to 5000 characters.');
    final invalid = file.validationError;
    if (invalid != null) return ReplyOutcome(messageSent: false, error: invalid);

    final api = ref.read(supportApiProvider);
    final String messageId;
    try {
      messageId = await api.reply(arg, trimmed);
    } on ApiException catch (e) {
      return ReplyOutcome(messageSent: false, error: e.message);
    }
    final uploadError = await _run(() => api.attach(arg, file, messageId: messageId));
    // The message did land: show it even though the upload failed.
    if (uploadError != null) await _reloadAfterMutation();
    return ReplyOutcome(
      messageSent: true,
      error: uploadError == null ? null : 'Your reply was sent, but the attachment was not: $uploadError',
    );
  }

  /// Raises a refund request against one of the linked patient's payments.
  /// Checked locally against the same rules the server applies (role,
  /// whole-rupee amount within the refundable balance, reason ≤ 1000 chars)
  /// so an agent isn't sent a request that is bound to be refused; the
  /// server re-checks all of it. On success the ticket is re-fetched, so the
  /// payment's refund list shows the real new REQUESTED row (the web view
  /// fakes one with id 'pending' instead).
  Future<String?> requestRefund({required String paymentId, required int amount, String? reason}) {
    final role = ref.read(authControllerProvider).valueOrNull?.user?.role;
    if (!canRequestRefunds(role)) {
      return Future.value('Only Customer Support and Admin can request refunds.');
    }
    RefundablePayment? payment;
    for (final p in state.valueOrNull?.refundablePayments ?? const <RefundablePayment>[]) {
      if (p.id == paymentId) payment = p;
    }
    if (payment == null) return Future.value('That payment is no longer refundable from this ticket.');
    if (amount <= 0 || amount > payment.remaining) {
      return Future.value('Enter an amount from ₹1 up to the refundable balance (₹${payment.remaining}).');
    }
    final cleanReason = reason?.trim();
    if (cleanReason != null && cleanReason.length > 1000) return Future.value('Keep the reason under 1000 characters.');
    return _run(() => ref.read(supportApiProvider).requestRefund(
          paymentId: paymentId,
          amount: amount,
          reason: (cleanReason == null || cleanReason.isEmpty) ? null : cleanReason,
        ));
  }

  Future<String?> claim() => _run(() => ref.read(supportApiProvider).claim(arg));

  Future<String?> updateStatus(String status) => _run(() => ref.read(supportApiProvider).updateStatus(arg, status));

  Future<String?> triage({String? department, String? priority}) {
    if (department == null && priority == null) {
      return Future.value('Choose a department and/or priority to update.');
    }
    return _run(() => ref.read(supportApiProvider).triage(arg, department: department, priority: priority));
  }

  Future<String?> _run(Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (e) {
      return e.message;
    }
    await _reloadAfterMutation();
    return null;
  }

  Future<void> _reloadAfterMutation() async {
    ref.invalidate(ticketQueueControllerProvider);
    try {
      // Triage can move a ticket to another department; the backend then
      // 404s this viewer (canView) — that's a real outcome, surfaced as the
      // screen's error state rather than a stale "success" view.
      state = AsyncValue.data(await ref.read(supportApiProvider).ticket(arg));
    } on ApiException catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

final ticketDetailControllerProvider =
    AsyncNotifierProvider.family<TicketDetailController, TicketDetail, String>(TicketDetailController.new);
