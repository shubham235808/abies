import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../../auth/domain/session_user.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/support_ticket.dart';
import 'ticket_badges.dart';
import 'ticket_detail_controller.dart';

/// Ticket thread + the staff actions from the web `TicketThread`
/// (packages/design-system/src/support/ticket-thread.tsx): reply, claim,
/// change status, triage, raising a refund request against the linked
/// patient's payments — plus attaching a file to a reply, which the web
/// thread has no UI for. The customer-360 link is deliberately not ported
/// (see README).
class TicketDetailScreen extends ConsumerStatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId});

  final String ticketId;

  @override
  ConsumerState<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends ConsumerState<TicketDetailScreen> {
  final _replyController = TextEditingController();
  bool _busy = false;
  AttachmentUpload? _attachment;

  @override
  void dispose() {
    _replyController.dispose();
    super.dispose();
  }

  TicketDetailController get _controller => ref.read(ticketDetailControllerProvider(widget.ticketId).notifier);

  Future<void> _perform(Future<String?> Function() action, {required String success, VoidCallback? onSuccess}) async {
    setState(() => _busy = true);
    final error = await action();
    if (!mounted) return;
    setState(() => _busy = false);
    if (error == null) onSuccess?.call();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(error ?? success),
        backgroundColor: error == null ? null : Theme.of(context).colorScheme.error,
      ));
  }

  Future<void> _pickAttachment() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: AttachmentUpload.allowedExtensions);
    final picked = result?.files.single;
    if (picked == null || picked.path == null || !mounted) return;
    final file = AttachmentUpload(
      path: picked.path!,
      filename: picked.name,
      mimeType: AttachmentUpload.mimeTypeFor(picked.name) ?? '',
      sizeBytes: picked.size,
    );
    final invalid = file.validationError;
    if (invalid != null) {
      _showSnack(invalid, isError: true);
      return;
    }
    setState(() => _attachment = file);
  }

  void _showSnack(String message, {required bool isError}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), backgroundColor: isError ? Theme.of(context).colorScheme.error : null));
  }

  Future<void> _send() async {
    final file = _attachment;
    if (file == null) {
      await _perform(() => _controller.reply(_replyController.text), success: 'Reply sent.', onSuccess: _replyController.clear);
      return;
    }
    setState(() => _busy = true);
    final outcome = await _controller.replyWithAttachment(_replyController.text, file);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (outcome.messageSent) _replyController.clear();
      // Keep the file picked if only the upload failed, so the agent can
      // retry it — with a new note, since the first one already went out.
      if (outcome.error == null) _attachment = null;
    });
    _showSnack(outcome.error ?? 'Reply and attachment sent.', isError: outcome.error != null);
  }

  Future<void> _requestRefund(RefundablePayment payment) async {
    final result = await showModalBottomSheet<({int amount, String reason})>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _RefundSheet(payment: payment),
    );
    if (result == null) return;
    await _perform(
      () => _controller.requestRefund(paymentId: payment.id, amount: result.amount, reason: result.reason),
      success: 'Refund of ₹${result.amount} requested. Finance will review it.',
    );
  }

  Future<void> _pickStatus(TicketDetail t) async {
    final options = allowedNextStatuses(t.status);
    final chosen = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('Move from “${humanizeEnum(t.status)}” to…', style: Theme.of(context).textTheme.titleMedium),
            ),
            for (final s in options)
              ListTile(
                leading: StatusBadge(status: s),
                onTap: () => Navigator.of(context).pop(s),
              ),
          ],
        ),
      ),
    );
    if (chosen == null) return;
    await _perform(() => _controller.updateStatus(chosen), success: 'Status changed to ${humanizeEnum(chosen)}.');
  }

  Future<void> _triage(TicketDetail t) async {
    final result = await showModalBottomSheet<({String department, String priority})>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _TriageSheet(department: t.department, priority: t.priority),
    );
    if (result == null) return;
    final department = result.department != t.department ? result.department : null;
    final priority = result.priority != t.priority ? result.priority : null;
    if (department == null && priority == null) return;
    await _perform(() => _controller.triage(department: department, priority: priority), success: 'Triage updated.');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(ticketDetailControllerProvider(widget.ticketId));
    final user = ref.watch(authControllerProvider).valueOrNull?.user;
    final userId = user?.id;
    final showRefunds = canRequestRefunds(user?.role);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ticket'),
        actions: [
          if (async.hasValue)
            PopupMenuButton<String>(
              enabled: !_busy,
              onSelected: (v) {
                final t = async.value!;
                if (v == 'status') _pickStatus(t);
                if (v == 'triage') _triage(t);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'status', child: Text('Change status')),
                PopupMenuItem(value: 'triage', child: Text('Update triage')),
              ],
            ),
        ],
      ),
      body: async.when(
        skipLoadingOnRefresh: true,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) {
          void retry() => ref.invalidate(ticketDetailControllerProvider(widget.ticketId));
          if (error is ApiException && error.isTransportFailure) return OfflineStateView(onRetry: retry);
          if (error is ApiException && error.statusCode == 404) {
            return const ErrorStateView(message: 'This ticket is no longer in your queue (it may have been moved to another department).');
          }
          return ErrorStateView(message: error is ApiException ? error.message : 'Could not load this ticket.', onRetry: retry);
        },
        data: (t) => Column(
          children: [
            if (_busy) const LinearProgressIndicator(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => _controller.refresh(),
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _Header(ticket: t),
                    const SizedBox(height: 12),
                    _AssignmentCard(
                      ticket: t,
                      isMine: userId != null && t.assignedAgentUserId == userId,
                      busy: _busy,
                      onClaim: () => _perform(_controller.claim, success: 'Ticket claimed.'),
                      onChangeStatus: () => _pickStatus(t),
                    ),
                    if (t.technicalIncidentDetail != null && !t.technicalIncidentDetail!.isEmpty) ...[
                      const SizedBox(height: 12),
                      _IncidentCard(detail: t.technicalIncidentDetail!),
                    ],
                    if (showRefunds && t.refundablePayments.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _PaymentsCard(payments: t.refundablePayments, busy: _busy, onRequestRefund: _requestRefund),
                    ],
                    if (t.looseAttachments.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _LooseAttachmentsCard(attachments: t.looseAttachments),
                    ],
                    const SizedBox(height: 16),
                    Text('Conversation', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (t.messages.isEmpty)
                      Text('No replies yet.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))
                    else
                      for (final m in t.messages) _MessageBubble(message: m, isMe: m.authorId != null && m.authorId == userId),
                  ],
                ),
              ),
            ),
            _ReplyBar(
              closed: t.isClosed,
              controller: _replyController,
              busy: _busy,
              attachment: _attachment,
              onAttach: _pickAttachment,
              onRemoveAttachment: () => setState(() => _attachment = null),
              onSend: _send,
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.ticket});

  final TicketDetail ticket;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final patient = ticket.linkedPatientName ?? ticket.linkedPatientMobile;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(ticket.subject, style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                PriorityBadge(priority: ticket.priority),
                StatusBadge(status: ticket.status),
                SlaBadge(status: ticket.status, sla: ticket.sla, now: DateTime.now()),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${categoryLabel(ticket.category)} · ${humanizeEnum(ticket.department)} · from ${ticket.requesterMobile}'
              '${patient != null ? ' · patient: $patient' : ''}',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 12),
            SelectableText(ticket.description),
            const SizedBox(height: 8),
            Text('Opened ${formatDateTime(ticket.createdAt)} via ${humanizeEnum(ticket.channel)}', style: muted),
            if (ticket.sla?.resolutionTarget != null) Text('Resolution target: ${ticket.sla!.resolutionTarget}', style: muted),
          ],
        ),
      ),
    );
  }
}

class _AssignmentCard extends StatelessWidget {
  const _AssignmentCard({
    required this.ticket,
    required this.isMine,
    required this.busy,
    required this.onClaim,
    required this.onChangeStatus,
  });

  final TicketDetail ticket;
  final bool isMine;
  final bool busy;
  final VoidCallback onClaim;
  final VoidCallback onChangeStatus;

  @override
  Widget build(BuildContext context) {
    final assignee = isMine ? 'you' : (ticket.assignedAgentMobile ?? 'unassigned');
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: Row(
          children: [
            Expanded(child: Text('Assigned to: $assignee')),
            if (!ticket.isAssigned)
              FilledButton.tonal(onPressed: busy ? null : onClaim, child: const Text('Claim'))
            else
              OutlinedButton(onPressed: busy ? null : onChangeStatus, child: const Text('Change status')),
          ],
        ),
      ),
    );
  }
}

class _IncidentCard extends StatelessWidget {
  const _IncidentCard({required this.detail});

  final TechnicalIncidentDetail detail;

  @override
  Widget build(BuildContext context) {
    final rows = <(String, String)>[
      if (detail.technicalModule != null) ('Module', humanizeEnum(detail.technicalModule!)),
      if (detail.errorClassification != null) ('Type', humanizeEnum(detail.errorClassification!)),
      if (detail.browserContext != null) ('Browser', detail.browserContext!),
      if (detail.correlationRequestId != null) ('Request ID', detail.correlationRequestId!),
    ];
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Incident details', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            for (final (label, value) in rows)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  children: [
                    SizedBox(width: 90, child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
                    Expanded(child: SelectableText(value)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.isMe});

  final TicketMessage message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final staff = message.isFromStaff;
    final who = isMe ? 'You' : (message.authorMobile ?? 'System');
    return Align(
      alignment: staff ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: staff ? scheme.primaryContainer : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(message.body),
            for (final a in message.attachments) _AttachmentRow(attachment: a),
            const SizedBox(height: 4),
            Text(
              '$who${message.authorRole != null && !isMe ? ' (${humanizeEnum(message.authorRole!)})' : ''} · ${formatDateTime(message.createdAt)}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReplyBar extends StatelessWidget {
  const _ReplyBar({
    required this.closed,
    required this.controller,
    required this.busy,
    required this.attachment,
    required this.onAttach,
    required this.onRemoveAttachment,
    required this.onSend,
  });

  final bool closed;
  final TextEditingController controller;
  final bool busy;
  final AttachmentUpload? attachment;
  final VoidCallback onAttach;
  final VoidCallback onRemoveAttachment;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      elevation: 6,
      color: scheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          child: closed
              ? Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text('This ticket is closed — change its status to reopen it before replying.',
                      style: TextStyle(color: scheme.onSurfaceVariant)),
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (attachment != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: InputChip(
                          avatar: Icon(_iconFor(attachment!.mimeType), size: 18),
                          label: Text('${attachment!.filename} · ${formatBytes(attachment!.sizeBytes)}', overflow: TextOverflow.ellipsis),
                          onDeleted: busy ? null : onRemoveAttachment,
                          deleteButtonTooltipMessage: 'Remove attachment',
                        ),
                      ),
                    Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    IconButton(
                      tooltip: 'Attach a file (PDF, JPG, PNG)',
                      onPressed: busy || attachment != null ? null : onAttach,
                      icon: const Icon(Icons.attach_file),
                    ),
                    Expanded(
                      child: TextField(
                        key: const ValueKey('reply-field'),
                        controller: controller,
                        minLines: 1,
                        maxLines: 5,
                        maxLength: 5000,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(hintText: 'Write a reply…', counterText: '', isDense: true),
                      ),
                    ),
                    const SizedBox(width: 4),
                    IconButton.filled(
                      tooltip: 'Send reply',
                      onPressed: busy ? null : onSend,
                      icon: const Icon(Icons.send),
                    ),
                  ],
                ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _TriageSheet extends StatefulWidget {
  const _TriageSheet({required this.department, required this.priority});

  final String department;
  final String priority;

  @override
  State<_TriageSheet> createState() => _TriageSheetState();
}

class _TriageSheetState extends State<_TriageSheet> {
  late String _department = triageDepartments.contains(widget.department) ? widget.department : triageDepartments.first;
  late String _priority = widget.priority;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Update triage', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _department,
              decoration: const InputDecoration(labelText: 'Department'),
              items: [for (final d in triageDepartments) DropdownMenuItem(value: d, child: Text(humanizeEnum(d)))],
              onChanged: (v) => setState(() => _department = v ?? _department),
            ),
            const SizedBox(height: 12),
            Text('Priority', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            SegmentedButton<String>(
              segments: [for (final p in ticketPriorities) ButtonSegment(value: p, label: Text(p))],
              selected: {_priority},
              onSelectionChanged: (s) => setState(() => _priority = s.first),
            ),
            const SizedBox(height: 8),
            Text(
              'Moving a ticket to another department removes it from your queue. Changing priority recalculates its response deadline from when the ticket was opened.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context).pop((department: _department, priority: _priority)),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}

IconData _iconFor(String mimeType) => mimeType == 'application/pdf' ? Icons.picture_as_pdf_outlined : Icons.image_outlined;

/// File name + size only: there is no backend route that serves an
/// attachment's bytes back to any client, so there is nothing to open.
class _AttachmentRow extends StatelessWidget {
  const _AttachmentRow({required this.attachment});

  final TicketAttachment attachment;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_iconFor(attachment.mimeType), size: 16, color: muted),
          const SizedBox(width: 6),
          Flexible(child: Text(attachment.originalName, overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 6),
          Text(formatBytes(attachment.sizeBytes), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: muted)),
        ],
      ),
    );
  }
}

class _LooseAttachmentsCard extends StatelessWidget {
  const _LooseAttachmentsCard({required this.attachments});

  final List<TicketAttachment> attachments;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Files on this ticket', style: Theme.of(context).textTheme.labelLarge),
            for (final a in attachments) _AttachmentRow(attachment: a),
          ],
        ),
      ),
    );
  }
}

/// The linked patient's refundable payments, same content as the web
/// `TicketThread`'s "Patient's payments" card. Shown only to the roles
/// `POST /api/v1/refunds` admits ([canRequestRefunds]).
class _PaymentsCard extends StatelessWidget {
  const _PaymentsCard({required this.payments, required this.busy, required this.onRequestRefund});

  final List<RefundablePayment> payments;
  final bool busy;
  final ValueChanged<RefundablePayment> onRequestRefund;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Patient's payments", style: theme.textTheme.labelLarge),
            for (final p in payments)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('${humanizeEnum(p.purpose)} — ₹${p.amount} (${humanizeEnum(p.status)})')),
                        Text(formatDateTime(p.createdAt), style: muted),
                      ],
                    ),
                    for (final r in p.refunds) Text('Refund of ₹${r.amount} — ${humanizeEnum(r.status)}', style: muted),
                    Row(
                      children: [
                        Expanded(child: Text(p.remaining > 0 ? 'Refundable: ₹${p.remaining}' : 'Fully committed to refunds', style: muted)),
                        if (p.remaining > 0)
                          TextButton(onPressed: busy ? null : () => onRequestRefund(p), child: const Text('Request refund')),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RefundSheet extends StatefulWidget {
  const _RefundSheet({required this.payment});

  final RefundablePayment payment;

  @override
  State<_RefundSheet> createState() => _RefundSheetState();
}

class _RefundSheetState extends State<_RefundSheet> {
  late final _amount = TextEditingController(text: '${widget.payment.remaining}');
  final _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    final amount = int.tryParse(_amount.text.trim());
    final remaining = widget.payment.remaining;
    if (amount == null || amount <= 0 || amount > remaining) {
      setState(() => _error = 'Enter a whole-rupee amount from ₹1 to ₹$remaining.');
      return;
    }
    Navigator.of(context).pop((amount: amount, reason: _reason.text));
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.payment;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Request a refund', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('${humanizeEnum(p.purpose)} — ₹${p.amount} paid on ${formatDateTime(p.createdAt)}. Up to ₹${p.remaining} can be refunded.'),
            const SizedBox(height: 12),
            TextField(
              key: const ValueKey('refund-amount'),
              controller: _amount,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(labelText: 'Amount (₹)', prefixText: '₹ ', errorText: _error),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              maxLength: 1000,
              minLines: 2,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Reason (optional)'),
            ),
            Text(
              'This raises a request only — no money moves until Finance or an Admin approves it.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _submit, child: const Text('Request refund')),
          ],
        ),
      ),
    );
  }
}
