import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/util/formatting.dart';
import '../../../shared/widgets/state_views.dart';
import '../../../shared/widgets/status_chip.dart';
import '../domain/lab_order.dart';
import 'dashboard_screen.dart' show errorMessage;
import 'lab_orders_controller.dart';

/// One order + the single next fulfilment step allowed from its status —
/// same stages and fields as the web `OrderActions`
/// (apps/partner-web/src/app/partner/lab/orders/[id]/order-actions.tsx),
/// plus `qualityException`, which `sampleCollectedSchema` accepts but the
/// web form doesn't expose.
class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(labOrderDetailControllerProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Order')),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(message: errorMessage(e), onRetry: () => ref.invalidate(labOrderDetailControllerProvider(orderId))),
        data: (order) => RefreshIndicator(
          onRefresh: () => ref.read(labOrderDetailControllerProvider(orderId).notifier).reload(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Header(order: order),
              const SizedBox(height: 12),
              _ItemsCard(order: order),
              const SizedBox(height: 12),
              _ProgressCard(order: order),
              const SizedBox(height: 12),
              _FulfilmentCard(order: order),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.order});

  final LabOrderDetail order;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(child: Text(order.patientName, style: Theme.of(context).textTheme.headlineSmall)),
          OrderStatusChip(status: order.status),
        ]),
        const SizedBox(height: 6),
        Text(order.scheduledAt != null ? formatDateTime(order.scheduledAt!) : 'Not scheduled', style: TextStyle(color: muted)),
        Text(order.collectionLabel, style: TextStyle(color: muted)),
        if (order.isHomeCollection && order.address != null && order.address!.isNotEmpty) ...[
          const SizedBox(height: 4),
          SelectableText(order.address!),
        ],
      ],
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.order});

  final LabOrderDetail order;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Tests', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final item in order.items)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(children: [
                  Expanded(child: Text(item.code != null ? '${item.name} (${item.code})' : item.name)),
                  Text(formatRupees(item.price)),
                ]),
              ),
            if (order.paymentStatus != null) ...[
              const Divider(),
              Text('Payment: ${order.paymentStatus}${order.paymentAmount != null ? ' · ${formatRupees(order.paymentAmount!)}' : ''}'),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.order});

  final LabOrderDetail order;

  @override
  Widget build(BuildContext context) {
    final sample = order.sampleCollection;
    final report = order.report;
    final lines = <String>[
      if (sample?.collectedAt != null)
        'Sample collected ${formatDateTime(sample!.collectedAt!)}'
            '${sample.collectorName != null ? ' by ${sample.collectorName}' : ''}'
            '${sample.sampleBarcode != null ? ' — barcode ${sample.sampleBarcode}' : ''}',
      if (sample?.qualityException != null) 'Quality exception: ${sample!.qualityException}',
      if (report?.releasedToPatientAt != null)
        'Report released ${formatDateTime(report!.releasedToPatientAt!)}${report.hasDocument ? '' : ' (no file attached)'}',
      if (report?.criticalFlag == true)
        report!.doctorAcknowledgedAt != null ? 'Flagged critical — acknowledged by doctor' : 'Flagged critical — awaiting doctor acknowledgement',
      if (order.status == LabOrderStatus.cancelled) 'Cancelled${order.cancellationReason != null ? ': ${order.cancellationReason}' : ''}',
    ];
    if (lines.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Progress', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final l in lines) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(l)),
          ],
        ),
      ),
    );
  }
}

class _FulfilmentCard extends ConsumerStatefulWidget {
  const _FulfilmentCard({required this.order});

  final LabOrderDetail order;

  @override
  ConsumerState<_FulfilmentCard> createState() => _FulfilmentCardState();
}

class _FulfilmentCardState extends ConsumerState<_FulfilmentCard> {
  final _collectorController = TextEditingController();
  final _barcodeController = TextEditingController();
  final _qualityController = TextEditingController();
  bool _criticalFlag = false;
  ReportUpload? _file;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _collectorController.dispose();
    _barcodeController.dispose();
    _qualityController.dispose();
    super.dispose();
  }

  LabOrderDetailController get _controller => ref.read(labOrderDetailControllerProvider(widget.order.id).notifier);

  Future<void> _run(Future<String?> Function() action, String successMessage) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await action();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
    }
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ReportUpload.allowedExtensions);
    final picked = result?.files.single;
    if (picked == null || picked.path == null) return;
    final mime = ReportUpload.mimeTypeFor(picked.name);
    if (mime == null) {
      setState(() => _error = 'Only PDF, JPG or PNG reports are accepted.');
      return;
    }
    setState(() {
      _error = null;
      _file = ReportUpload(path: picked.path!, filename: picked.name, mimeType: mime);
    });
  }

  Future<void> _confirmRelease() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Release report?'),
        content: Text(
          'The patient will be notified and can view it immediately. This cannot be undone.'
          '${_file == null ? '\n\nNo report file is attached.' : ''}'
          '${_criticalFlag ? '\n\nFlagged critical — the recommending doctor is notified urgently.' : ''}',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Release')),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(() => _controller.releaseReport(criticalFlag: _criticalFlag, file: _file), 'Report released to patient');
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.order.status;
    final Widget body;
    switch (status) {
      case LabOrderStatus.scheduled:
        body = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(controller: _collectorController, decoration: const InputDecoration(labelText: 'Collector name')),
          const SizedBox(height: 12),
          TextField(controller: _barcodeController, decoration: const InputDecoration(labelText: 'Sample barcode')),
          const SizedBox(height: 12),
          TextField(
            controller: _qualityController,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Quality exception (optional)', hintText: 'e.g. haemolysed sample'),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy
                ? null
                : () => _run(
                      () => _controller.markSampleCollected(
                        collectorName: _collectorController.text,
                        sampleBarcode: _barcodeController.text,
                        qualityException: _qualityController.text,
                      ),
                      'Sample marked collected',
                    ),
            child: Text(LabOrderAction.collectSample.label),
          ),
        ]);
      case LabOrderStatus.sampleCollected:
        body = FilledButton(
          onPressed: _busy ? null : () => _run(_controller.startProcessing, 'Processing started'),
          child: Text(LabOrderAction.startProcessing.label),
        );
      case LabOrderStatus.processing:
        body = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          OutlinedButton.icon(
            onPressed: _busy ? null : _pickFile,
            icon: const Icon(Icons.attach_file),
            label: Text(_file == null ? 'Attach report (PDF, JPG, PNG)' : _file!.filename, overflow: TextOverflow.ellipsis),
          ),
          if (_file != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: _busy ? null : () => setState(() => _file = null), child: const Text('Remove file')),
            ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _criticalFlag,
            onChanged: _busy ? null : (v) => setState(() => _criticalFlag = v ?? false),
            title: const Text('Flag as a critical result (notifies the recommending doctor urgently)'),
          ),
          FilledButton(onPressed: _busy ? null : _confirmRelease, child: Text(LabOrderAction.releaseReport.label)),
        ]);
      case LabOrderStatus.booked:
        body = const Text('Awaiting patient payment.');
      case LabOrderStatus.completed:
        body = const Text('Fulfilment complete.');
      case LabOrderStatus.cancelled:
        body = const Text('This order was cancelled.');
      case LabOrderStatus.unknown:
        body = const Text('This order is in a state this app does not recognise. Use the partner portal.');
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Fulfilment', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            if (_error != null) ...[
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              const SizedBox(height: 8),
            ],
            body,
            if (_busy) const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
          ],
        ),
      ),
    );
  }
}
