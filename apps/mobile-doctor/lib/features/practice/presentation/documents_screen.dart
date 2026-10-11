import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/doctor_profile.dart';
import '../domain/profile_inputs.dart';
import 'documents_controller.dart';
import 'profile_screen.dart';

/// Credential documents with their admin review status — port of
/// apps/partner-web/.../doctor/documents.
class DocumentsScreen extends ConsumerWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(documentsControllerProvider);
    listenForProfileWorkMessages(context, ref, documentsControllerProvider);
    final notifier = ref.read(documentsControllerProvider.notifier);
    final canUpload = async.valueOrNull != null && notifier.uploadableTypes().isNotEmpty;
    return Scaffold(
      appBar: AppBar(title: const Text('Documents')),
      floatingActionButton: !canUpload
          ? null
          : FloatingActionButton.extended(
              icon: const Icon(Icons.upload_file),
              label: const Text('Upload'),
              onPressed: async.value!.busy
                  ? null
                  : () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) => _UploadSheet(types: notifier.uploadableTypes()),
                      ),
            ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: e is ApiException ? e.message : 'Could not load your documents.',
          onRetry: () => ref.invalidate(documentsControllerProvider),
        ),
        data: (state) => Stack(
          children: [
            ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                Text(
                  'Registration certificate and degree certificate are required before you can submit for verification. '
                  'PDF, JPG or PNG only, up to 10 MB.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (!state.profile.credentialDocumentsEditable) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Credential documents are locked while verification is in progress or approved. '
                    'You can still update your profile photo.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 12),
                if (state.profile.documents.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 48),
                    child: EmptyStateView(message: 'No documents uploaded yet.', icon: Icons.description_outlined),
                  ),
                for (final d in state.profile.documents) _DocumentTile(document: d, busy: state.busy),
              ],
            ),
            if (state.busy) const Positioned(top: 0, left: 0, right: 0, child: LinearProgressIndicator()),
          ],
        ),
      ),
    );
  }
}

/// Review-status badge for `DoctorDocumentStatus`, using the same tones the
/// web DocumentsManager's `STATUS_TONE` uses (neutral / success / danger /
/// orange).
class DocumentStatusChip extends StatelessWidget {
  const DocumentStatusChip(this.status, {super.key});

  final String status;

  static String label(String status) => switch (status) {
        'PENDING' => 'Pending review',
        'VERIFIED' => 'Verified',
        'REJECTED' => 'Rejected',
        'RESUBMISSION_REQUIRED' => 'Resubmission required',
        _ => humanizeEnum(status),
      };

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).extension<AppSemanticColors>()!;
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (status) {
      'VERIFIED' => (c.successSubtle, c.successStrong),
      'REJECTED' => (c.dangerSubtle, c.dangerStrong),
      'RESUBMISSION_REQUIRED' => (c.warningSubtle, c.warningStrong),
      _ => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(label(status), style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class _DocumentTile extends ConsumerWidget {
  const _DocumentTile({required this.document, required this.busy});

  final DoctorDocument document;
  final bool busy;

  Future<void> _view(WidgetRef ref) async {
    final url = await ref.read(documentsControllerProvider.notifier).downloadUrl(document.id);
    if (url == null) return;
    final opened = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!opened) ref.read(documentsControllerProvider.notifier).reject(error: 'Could not open the document on this device.');
  }

  Future<void> _remove(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove this document?'),
        content: const Text('You can upload a replacement afterward, but this copy will be deleted immediately.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove')),
        ],
      ),
    );
    if (ok == true) await ref.read(documentsControllerProvider.notifier).remove(document);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canRemove = ref.read(documentsControllerProvider.notifier).canRemove(document);
    final small = Theme.of(context).textTheme.bodySmall;
    final uploaded = document.createdAt;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(documentTypeLabel(document.type), style: Theme.of(context).textTheme.titleSmall)),
                DocumentStatusChip(document.status),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              [document.originalName, if (uploaded != null) 'uploaded ${formatDate(uploaded)}'].join(' · '),
              style: small,
            ),
            if (document.reviewNote != null) ...[
              const SizedBox(height: 4),
              Text('Reviewer note: ${document.reviewNote}', style: small),
            ],
            if (document.needsResubmission) ...[
              const SizedBox(height: 4),
              Text(
                'Upload a corrected copy first, then remove this one.',
                style: small?.copyWith(color: Theme.of(context).extension<AppSemanticColors>()!.warningStrong),
              ),
            ],
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: busy ? null : () => _view(ref), child: const Text('View')),
                if (canRemove) TextButton(onPressed: busy ? null : () => _remove(context, ref), child: const Text('Remove')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _UploadSheet extends ConsumerStatefulWidget {
  const _UploadSheet({required this.types});

  final List<String> types;

  @override
  ConsumerState<_UploadSheet> createState() => _UploadSheetState();
}

class _UploadSheetState extends ConsumerState<_UploadSheet> {
  late String _type = widget.types.first;
  DocumentUpload? _file;
  String? _error;
  bool _saving = false;

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: DocumentUpload.allowedExtensions);
    final picked = result?.files.single;
    if (picked == null || picked.path == null) return;
    final mime = DocumentUpload.mimeTypeFor(picked.name);
    final file = DocumentUpload(path: picked.path!, filename: picked.name, mimeType: mime ?? '', sizeBytes: picked.size);
    setState(() {
      _error = file.validate(type: _type);
      _file = _error == null ? file : null;
    });
  }

  Future<void> _upload() async {
    final file = _file;
    if (file == null) {
      setState(() => _error = 'Choose a file first.');
      return;
    }
    setState(() => _saving = true);
    final ok = await ref.read(documentsControllerProvider.notifier).upload(type: _type, file: file);
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Upload a document', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Document type'),
            items: [for (final t in widget.types) DropdownMenuItem(value: t, child: Text(documentTypeLabel(t)))],
            onChanged: _saving ? null : (v) => setState(() => _type = v ?? _type),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.attach_file),
            label: Text(_file?.filename ?? 'Choose PDF, JPG or PNG'),
            onPressed: _saving ? null : _pick,
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(onPressed: _saving ? null : _upload, child: const Text('Upload')),
        ],
      ),
    );
  }
}
