import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart' as url_launcher;

import '../../../core/api/api_exception.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/therapist_document.dart';
import 'dashboard_controller.dart';

/// Opens a URL outside the app. Overridden in tests. Same choice as
/// apps/mobile's DiagnosticReportController: the system browser/viewer
/// (`LaunchMode.externalApplication`), never an in-app WebView, and nothing
/// is written to device storage by this app.
final externalUrlLauncherProvider = Provider<Future<bool> Function(Uri uri)>(
  (ref) => (uri) => url_launcher.launchUrl(uri, mode: url_launcher.LaunchMode.externalApplication),
);

/// One therapist's credential documents
/// (apps/partner-web/.../therapists/[id]/documents-manager.tsx): list with
/// review status, upload, remove, open. Keyed by therapist id. Like the
/// other catalogue controllers, every action returns null on success or a
/// user-facing message, and leaves the list untouched on failure.
class TherapistDocumentsController extends AutoDisposeFamilyAsyncNotifier<List<TherapistDocument>, String> {
  @override
  Future<List<TherapistDocument>> build(String therapistId) async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('TherapistDocumentsController read before sign-in');
    return ref.read(centreApiProvider).therapistDocuments(therapistId);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(centreApiProvider).therapistDocuments(arg));
  }

  Future<String?> upload(TherapistDocumentType type, TherapistDocumentUpload file) async {
    try {
      final created = await ref.read(centreApiProvider).uploadTherapistDocument(arg, type, file);
      state = AsyncValue.data([created, ...?state.valueOrNull]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    } on FileSystemException {
      // MultipartFile.fromFile couldn't read the picked file (moved/deleted
      // temp copy) — the request was never sent.
      return 'Couldn’t read that file. Try picking it again.';
    }
  }

  Future<String?> remove(String documentId) async {
    try {
      await ref.read(centreApiProvider).deleteTherapistDocument(arg, documentId);
      state = AsyncValue.data([...?state.valueOrNull?.where((d) => d.id != documentId)]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Fetches a fresh signed URL (it expires after 5 minutes, so it's never
  /// cached) and hands it to the system viewer.
  Future<String?> open(String documentId) async {
    try {
      final url = await ref.read(centreApiProvider).therapistDocumentDownloadUrl(arg, documentId);
      final uri = Uri.tryParse(url);
      if (uri == null || !uri.hasScheme) return 'Couldn’t open this document.';
      final opened = await ref.read(externalUrlLauncherProvider)(uri);
      return opened ? null : 'No app on this device can open this document.';
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final therapistDocumentsControllerProvider =
    AsyncNotifierProvider.autoDispose.family<TherapistDocumentsController, List<TherapistDocument>, String>(TherapistDocumentsController.new);
