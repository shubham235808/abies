import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/formatting.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../domain/centre_models.dart';
import 'booking_detail_controller.dart';
import 'widgets.dart';

/// Booking fulfilment: course progress, schedule the next session (with an
/// optional therapist), mark a session attended (optional notes /
/// exception flag), cancel. See [BookingDetailController].
class BookingDetailScreen extends ConsumerStatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends ConsumerState<BookingDetailScreen> {
  bool _busy = false;

  BookingDetailController get _controller => ref.read(bookingDetailControllerProvider(widget.bookingId).notifier);

  Future<void> _run(Future<String?> Function() action, String successMessage) async {
    setState(() => _busy = true);
    final error = await action();
    if (!mounted) return;
    setState(() => _busy = false);
    showMessage(context, error ?? successMessage, isError: error != null);
  }

  Future<void> _schedule(BookingDetailState state) async {
    final result = await showModalBottomSheet<_ScheduleResult>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ScheduleSheet(therapists: state.therapists, nextSessionNumber: state.booking.sessions.length + 1),
    );
    if (result == null) return;
    await _run(() => _controller.scheduleSession(scheduledAt: result.scheduledAt, therapistId: result.therapistId), 'Session scheduled');
  }

  Future<void> _markAttended(CentreSession session) async {
    final result = await showDialog<_AttendResult>(context: context, builder: (_) => _AttendDialog(sessionNumber: session.sessionNumber));
    if (result == null) return;
    await _run(
      () => _controller.markAttended(session.id, notes: result.notes, exceptionFlag: result.exceptionFlag),
      'Session ${session.sessionNumber} marked attended',
    );
  }

  Future<void> _cancel() async {
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content: TextField(
          controller: reasonController,
          maxLength: 500,
          decoration: const InputDecoration(labelText: 'Reason (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep booking')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel booking')),
        ],
      ),
    );
    final reason = reasonController.text.trim();
    reasonController.dispose();
    if (confirmed != true) return;
    await _run(() => _controller.cancel(reason: reason.isEmpty ? null : reason), 'Booking cancelled');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(bookingDetailControllerProvider(widget.bookingId));
    return Scaffold(
      appBar: AppBar(title: const Text('Booking')),
      body: async.when(
        loading: () => const Padding(padding: EdgeInsets.all(16), child: LoadingSkeleton(height: 160)),
        error: (e, _) => errorView(e, () => ref.invalidate(bookingDetailControllerProvider(widget.bookingId))),
        data: (state) => _buildBody(context, state),
      ),
    );
  }

  Widget _buildBody(BuildContext context, BookingDetailState state) {
    final booking = state.booking;
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _controller.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(child: Text(booking.patientName, style: theme.textTheme.titleLarge)),
              BookingStatusChip(status: booking.status),
            ],
          ),
          const SizedBox(height: 4),
          Text([
            booking.therapyName,
            if (booking.therapyDurationMinutes != null) '${booking.therapyDurationMinutes} min/session',
          ].join(' · ')),
          Text('Booked ${formatDate(booking.createdAt)}'
              '${booking.paymentAmount != null ? ' · Paid ${formatRupees(booking.paymentAmount!)}' : ''}'),
          const SizedBox(height: 16),
          Text('Course progress: ${booking.attendedCount}/${booking.sessionCount} attended', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: booking.sessionCount == 0 ? 0 : booking.attendedCount / booking.sessionCount,
            minHeight: 8,
            borderRadius: BorderRadius.circular(8),
          ),
          if (_busy) const Padding(padding: EdgeInsets.only(top: 8), child: LinearProgressIndicator()),
          const SizedBox(height: 16),
          Card(
            margin: EdgeInsets.zero,
            child: Column(
              children: [
                for (var n = 1; n <= booking.sessionCount; n++) _sessionRow(booking, n),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (booking.canScheduleMore)
            FilledButton.icon(
              onPressed: _busy ? null : () => _schedule(state),
              icon: const Icon(Icons.event_available),
              label: Text('Schedule session ${booking.sessions.length + 1}'),
            ),
          if (booking.status == BookingStatus.completed)
            const _Note(icon: Icons.check_circle_outline, text: 'This course is complete.'),
          if (booking.status == BookingStatus.cancelled)
            _Note(
              icon: Icons.cancel_outlined,
              text: 'This booking was cancelled${booking.cancellationReason != null ? ': ${booking.cancellationReason}' : '.'}',
            ),
          if (booking.isCancellable) ...[
            const SizedBox(height: 8),
            OutlinedButton(onPressed: _busy ? null : _cancel, child: const Text('Cancel booking')),
          ],
        ],
      ),
    );
  }

  Widget _sessionRow(CentreBooking booking, int number) {
    final session = booking.sessions.where((s) => s.sessionNumber == number).firstOrNull;
    if (session == null) {
      return ListTile(
        leading: CircleAvatar(child: Text('$number')),
        title: Text('Session $number'),
        subtitle: const Text('Not yet scheduled'),
      );
    }
    final details = <String>[
      formatDateTime(session.scheduledAt),
      if (session.therapistName != null) session.therapistName!,
      if (session.attendedAt != null) 'Attended ${formatDateTime(session.attendedAt!)}',
      if (session.notes != null) 'Notes: ${session.notes}',
      if (session.exceptionFlag != null) 'Exception: ${session.exceptionFlag}',
    ];
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: session.isAttended ? Theme.of(context).colorScheme.primary : null,
        foregroundColor: session.isAttended ? Theme.of(context).colorScheme.onPrimary : null,
        child: session.isAttended ? const Icon(Icons.check, size: 18) : Text('$number'),
      ),
      title: Text('Session $number'),
      subtitle: Text(details.join('\n')),
      isThreeLine: details.length > 1,
      trailing: booking.canMarkAttended(session)
          ? TextButton(onPressed: _busy ? null : () => _markAttended(session), child: const Text('Mark attended'))
          : null,
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.outline),
        const SizedBox(width: 8),
        Expanded(child: Text(text)),
      ],
    );
  }
}

class _ScheduleResult {
  const _ScheduleResult(this.scheduledAt, this.therapistId);

  final DateTime scheduledAt;
  final String? therapistId;
}

class _ScheduleSheet extends StatefulWidget {
  const _ScheduleSheet({required this.therapists, required this.nextSessionNumber});

  final List<Therapist> therapists;
  final int nextSessionNumber;

  @override
  State<_ScheduleSheet> createState() => _ScheduleSheetState();
}

class _ScheduleSheetState extends State<_ScheduleSheet> {
  DateTime? _date;
  TimeOfDay? _time;
  String? _therapistId;

  DateTime? get _scheduledAt =>
      (_date == null || _time == null) ? null : DateTime(_date!.year, _date!.month, _date!.day, _time!.hour, _time!.minute);

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now,
      firstDate: DateTime(now.year, now.month, now.day).subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time ?? const TimeOfDay(hour: 10, minute: 0));
    if (picked != null) setState(() => _time = picked);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Schedule session ${widget.nextSessionNumber}', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _pickDate,
            icon: const Icon(Icons.calendar_today),
            label: Text(_date == null ? 'Choose date' : formatDate(_date!)),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pickTime,
            icon: const Icon(Icons.schedule),
            label: Text(_time == null ? 'Choose time' : _time!.format(context)),
          ),
          if (widget.therapists.isNotEmpty) ...[
            const SizedBox(height: 16),
            DropdownButtonFormField<String?>(
              initialValue: _therapistId,
              decoration: const InputDecoration(labelText: 'Therapist (optional)'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Unassigned')),
                for (final t in widget.therapists) DropdownMenuItem<String?>(value: t.id, child: Text(t.name)),
              ],
              onChanged: (v) => setState(() => _therapistId = v),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _scheduledAt == null ? null : () => Navigator.pop(context, _ScheduleResult(_scheduledAt!, _therapistId)),
            child: const Text('Schedule'),
          ),
        ],
      ),
    );
  }
}

class _AttendResult {
  const _AttendResult(this.notes, this.exceptionFlag);

  final String? notes;
  final String? exceptionFlag;
}

class _AttendDialog extends StatefulWidget {
  const _AttendDialog({required this.sessionNumber});

  final int sessionNumber;

  @override
  State<_AttendDialog> createState() => _AttendDialogState();
}

class _AttendDialogState extends State<_AttendDialog> {
  final _notes = TextEditingController();
  final _exception = TextEditingController();

  @override
  void dispose() {
    _notes.dispose();
    _exception.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Mark session ${widget.sessionNumber} attended'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Bounds from markSessionAttendedSchema: notes ≤ 2000, exceptionFlag ≤ 500.
            TextField(controller: _notes, maxLength: 2000, maxLines: 3, minLines: 1, decoration: const InputDecoration(labelText: 'Notes (optional)')),
            TextField(
              controller: _exception,
              maxLength: 500,
              decoration: const InputDecoration(labelText: 'Exception flag (optional)', hintText: 'e.g. Reaction observed'),
            ),
            const Text('This can’t be undone.'),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Back')),
        FilledButton(
          onPressed: () {
            final notes = _notes.text.trim();
            final exception = _exception.text.trim();
            Navigator.pop(context, _AttendResult(notes.isEmpty ? null : notes, exception.isEmpty ? null : exception));
          },
          child: const Text('Mark attended'),
        ),
      ],
    );
  }
}
