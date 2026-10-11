import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/formatting.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/therapist_document.dart';
import 'therapist_documents_controller.dart';
import 'widgets.dart';

/// `/therapists/:id/documents` — mirrors apps/partner-web's therapist
/// documents manager: each document with its admin review status (and the
/// reviewer's note), View (fresh signed link), Remove, and an upload form.
class TherapistDocumentsScreen extends ConsumerStatefulWidget {
  const TherapistDocumentsScreen({super.key, required this.therapistId, this.therapistName});

  final String therapistId;
  final String? therapistName;

  @override
  ConsumerState<TherapistDocumentsScreen> createState() => _TherapistDocumentsScreenState();
}

class _TherapistDocumentsScreenState extends ConsumerState<TherapistDocumentsScreen> {
  /// Id of the document whose View/Remove is in flight, so its row shows
  /// progress and repeat taps are ignored.
  String? _busyDocumentId;
  bool _uploading = false;

  TherapistDocumentsController get _controller => ref.read(therapistDocumentsControllerProvider(widget.therapistId).notifier);

  Future<void> _openUploadSheet() async {
    final request = await showModalBottomSheet<(TherapistDocumentType, TherapistDocumentUpload)>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _UploadSheet(),
    );
    if (request == null || !mounted) return;
    setState(() => _uploading = true);
    final error = await _controller.upload(request.$1, request.$2);
    if (!mounted) return;
    setState(() => _uploading = false);
    showMessage(context, error ?? 'Document uploaded', isError: error != null);
  }

  Future<void> _run(String documentId, Future<String?> Function() action, {String? success}) async {
    if (_busyDocumentId != null) return;
    setState(() => _busyDocumentId = documentId);
    final error = await action();
    if (!mounted) return;
    setState(() => _busyDocumentId = null);
    if (error != null) {
      showMessage(context, error, isError: true);
    } else if (success != null) {
      showMessage(context, success);
    }
  }

  Future<void> _confirmRemove(TherapistDocument doc) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove this document?'),
        content: Text('${doc.typeLabel} · ${doc.originalName}\n\nThis can’t be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true) return;
    await _run(doc.id, () => _controller.remove(doc.id), success: 'Document removed');
  }

  @override
  Widget build(BuildContext context) {
    final provider = therapistDocumentsControllerProvider(widget.therapistId);
    final async = ref.watch(provider);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.therapistName == null ? 'Documents' : '${widget.therapistName} · Documents'),
        bottom: _uploading ? const PreferredSize(preferredSize: Size.fromHeight(4), child: LinearProgressIndicator()) : null,
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'upload-therapist-document',
        onPressed: _uploading ? null : _openUploadSheet,
        icon: const Icon(Icons.upload_file),
        label: Text(_uploading ? 'Uploading…' : 'Upload'),
      ),
      body: async.when(
        loading: () => const Padding(padding: EdgeInsets.all(16), child: LoadingSkeleton(height: 72)),
        error: (e, _) => errorView(e, () => ref.invalidate(provider)),
        data: (documents) => documents.isEmpty
            ? const EmptyStateView(
                message: 'No documents uploaded yet. Add this therapist’s ID proof and qualification certificates for verification.',
                icon: Icons.folder_open_outlined,
              )
            : RefreshIndicator(
                onRefresh: () => _controller.refresh(),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    for (final doc in documents)
                      _DocumentCard(
                        document: doc,
                        busy: _busyDocumentId == doc.id,
                        onView: () => _run(doc.id, () => _controller.open(doc.id)),
                        onRemove: () => _confirmRemove(doc),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({required this.document, required this.busy, required this.onView, required this.onRemove});

  final TherapistDocument document;
  final bool busy;
  final VoidCallback onView;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final created = document.createdAt;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(document.mimeType == 'application/pdf' ? Icons.picture_as_pdf_outlined : Icons.image_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(child: Text(document.typeLabel, style: theme.textTheme.titleMedium)),
                TherapistDocumentStatusChip(status: document.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              [document.originalName, if (created != null) 'Uploaded ${formatDate(created)}'].join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
            if (document.reviewNote != null && document.reviewNote!.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Reviewer note: ${document.reviewNote}',
                style: theme.textTheme.bodySmall?.copyWith(color: document.needsAction ? theme.colorScheme.error : null),
              ),
            ],
            if (document.needsAction) ...[
              const SizedBox(height: 4),
              Text('Remove this file and upload a corrected one.', style: theme.textTheme.bodySmall),
            ],
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (busy) const Padding(padding: EdgeInsets.all(12), child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))),
                TextButton.icon(onPressed: busy ? null : onView, icon: const Icon(Icons.open_in_new, size: 18), label: const Text('View')),
                TextButton.icon(onPressed: busy ? null : onRemove, icon: const Icon(Icons.delete_outline, size: 18), label: const Text('Remove')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class TherapistDocumentStatusChip extends StatelessWidget {
  const TherapistDocumentStatusChip({super.key, required this.status});

  final TherapistDocumentStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (status) {
      TherapistDocumentStatus.verified => (scheme.tertiaryContainer, scheme.onTertiaryContainer),
      TherapistDocumentStatus.rejected || TherapistDocumentStatus.resubmissionRequired => (scheme.errorContainer, scheme.onErrorContainer),
      _ => (scheme.secondaryContainer, scheme.onSecondaryContainer),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status.label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: fg)),
    );
  }
}

/// Type + file picker. Pops `(type, upload)` once a valid file is chosen;
/// the file is validated against the server's own rules
/// ([TherapistDocumentUpload.fromPicked]) before anything is sent.
class _UploadSheet extends StatefulWidget {
  const _UploadSheet();

  @override
  State<_UploadSheet> createState() => _UploadSheetState();
}

class _UploadSheetState extends State<_UploadSheet> {
  TherapistDocumentType _type = TherapistDocumentType.values.first;
  TherapistDocumentUpload? _file;
  String? _error;

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: TherapistDocumentUpload.allowedExtensions);
    final picked = result?.files.single;
    if (picked == null || !mounted) return;
    final (upload, error) = TherapistDocumentUpload.fromPicked(path: picked.path, name: picked.name, size: picked.size);
    setState(() {
      _file = upload;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final file = _file;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Upload document', style: theme.textTheme.titleLarge),
            const SizedBox(height: 16),
            DropdownButtonFormField<TherapistDocumentType>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'Document type'),
              items: [for (final t in TherapistDocumentType.values) DropdownMenuItem(value: t, child: Text(t.label))],
              onChanged: (t) => setState(() => _type = t ?? _type),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _pick,
              icon: const Icon(Icons.attach_file),
              label: Text(file == null ? 'Choose file' : file.filename, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(height: 6),
            Text('PDF, JPG or PNG, up to 10 MB.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: file == null ? null : () => Navigator.pop(context, (_type, file)),
              child: const Text('Upload'),
            ),
          ],
        ),
      ),
    );
  }
}
