import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

/// Downloads a diagnostic report from the short-lived signed URL
/// `DiagnosticsApi.reportDownloadUrl` returns, straight to **app-private**
/// storage — never shared/public storage (docs/mobile/SECURITY-DESIGN.md §8).
///
/// Deliberately bypasses [ApiClient] with a bare [Dio] instance: the signed
/// URL points at object storage (MinIO), not this app's own `/api/v1/*`
/// backend, so the session cookie jar/request-id interceptor don't apply —
/// same precedent as Phase 4's `DoctorDetailScreen`, which pointed
/// `Image.network` directly at the doctor photo route's signed redirect
/// target rather than routing it through [ApiClient].
///
/// `getApplicationDocumentsDirectory()` is the app's own sandboxed storage
/// on both platforms — not visible to other apps, and (deliberately) never
/// made visible via a sharing/exporter flag here. Nothing in this class
/// opens or shares the saved file; that is only ever a separate, explicit
/// user action (see `DiagnosticOrderDetailScreen`).
class ReportFileDownloader {
  const ReportFileDownloader();

  /// Saves the file as `<orderId>-<suggestedName>` under this app's private
  /// documents directory and returns the local [File]. Overwrites any
  /// previous download for the same order so a re-download after a report
  /// correction always reflects the latest release.
  Future<File> download({required String signedUrl, required String orderId, String suggestedName = 'diagnostic-report'}) async {
    final dir = await getApplicationDocumentsDirectory();
    final reportsDir = Directory('${dir.path}/diagnostic-reports');
    if (!await reportsDir.exists()) {
      await reportsDir.create(recursive: true);
    }
    final safeName = suggestedName.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
    final savePath = '${reportsDir.path}/$orderId-$safeName';
    final dio = Dio();
    try {
      await dio.download(signedUrl, savePath);
    } finally {
      dio.close();
    }
    return File(savePath);
  }
}
