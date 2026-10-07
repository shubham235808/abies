import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart' as url_launcher;

import '../../../core/api/api_exception.dart';
import '../data/report_file_downloader.dart';
import '../domain/diagnostic_report_ref.dart';
import 'diagnostics_search_controller.dart';

enum DiagnosticReportActionStatus { idle, working, success, error }

class DiagnosticReportActionState {
  const DiagnosticReportActionState({this.status = DiagnosticReportActionStatus.idle, this.message});

  final DiagnosticReportActionStatus status;
  final String? message;

  static const idle = DiagnosticReportActionState();
}

/// Resolves and acts on a diagnostic order's released report — the actual
/// patient-facing path (docs/mobile/SECURITY-DESIGN.md §8), **not**
/// `GET /api/v1/diagnostic-orders/[id]/report-download` (that route is
/// doctor-only — `requireRole(ctx, 'DOCTOR')`, confirmed by reading it; see
/// `DiagnosticReportRef`'s doc comment and `lib/features/diagnostics/
/// PHASE.md`). Two explicit, separate actions, never automatic:
///
/// - [view]: fetches a fresh signed URL (`DiagnosticsApi.reportDownloadUrl`,
///   5-minute expiry) and hands it to the system browser/viewer
///   (`url_launcher`, `LaunchMode.externalApplication`) — never an in-app
///   WebView (SECURITY-DESIGN.md §9 reserves that for Razorpay checkout
///   only), and nothing is written to device storage for this action.
/// - [download]: fetches a fresh signed URL and saves the bytes to this
///   app's own private sandbox directory (`ReportFileDownloader`, never
///   shared/public storage). Never auto-opens or auto-shares the saved
///   file — that would need its own separate explicit tap this phase
///   doesn't build a UI for, per SECURITY-DESIGN.md §8's "never an automatic
///   export" rule.
///
/// Keyed by orderId ([StateNotifierProvider.family]) so each order's action
/// state (loading/success/error) is independent.
class DiagnosticReportController extends StateNotifier<DiagnosticReportActionState> {
  DiagnosticReportController(
    this._ref,
    this._orderId, {
    ReportFileDownloader downloader = const ReportFileDownloader(),
    Future<bool> Function(Uri uri)? launch,
  })  : _downloader = downloader,
        _launch = launch ?? _defaultLaunch,
        super(DiagnosticReportActionState.idle);

  final Ref _ref;
  final String _orderId;
  final ReportFileDownloader _downloader;
  final Future<bool> Function(Uri uri) _launch;

  static Future<bool> _defaultLaunch(Uri uri) => url_launcher.launchUrl(uri, mode: url_launcher.LaunchMode.externalApplication);

  Future<String?> _resolveSignedUrl() async {
    final api = _ref.read(diagnosticsApiProvider);
    final reports = await api.myReports();
    DiagnosticReportRef? match;
    for (final r in reports) {
      if (r.sourceEntityType == 'DiagnosticOrder' && r.sourceEntityId == _orderId) {
        match = r;
        break;
      }
    }
    if (match == null) return null;
    return api.reportDownloadUrl(match.id);
  }

  Future<void> view() async {
    state = const DiagnosticReportActionState(status: DiagnosticReportActionStatus.working);
    try {
      final url = await _resolveSignedUrl();
      if (url == null) {
        state = const DiagnosticReportActionState(status: DiagnosticReportActionStatus.error, message: 'Report not found for this order.');
        return;
      }
      final opened = await _launch(Uri.parse(url));
      state = opened
          ? const DiagnosticReportActionState(status: DiagnosticReportActionStatus.success, message: 'Opened the report.')
          : const DiagnosticReportActionState(status: DiagnosticReportActionStatus.error, message: 'Could not open the report.');
    } on ApiException catch (e) {
      state = DiagnosticReportActionState(status: DiagnosticReportActionStatus.error, message: e.message);
    }
  }

  Future<void> download() async {
    state = const DiagnosticReportActionState(status: DiagnosticReportActionStatus.working);
    try {
      final url = await _resolveSignedUrl();
      if (url == null) {
        state = const DiagnosticReportActionState(status: DiagnosticReportActionStatus.error, message: 'Report not found for this order.');
        return;
      }
      final file = await _downloader.download(signedUrl: url, orderId: _orderId);
      state = DiagnosticReportActionState(status: DiagnosticReportActionStatus.success, message: 'Saved to ${file.path}');
    } on ApiException catch (e) {
      state = DiagnosticReportActionState(status: DiagnosticReportActionStatus.error, message: e.message);
    } catch (_) {
      state = const DiagnosticReportActionState(status: DiagnosticReportActionStatus.error, message: 'Could not download the report.');
    }
  }
}

final diagnosticReportControllerProvider =
    StateNotifierProvider.family<DiagnosticReportController, DiagnosticReportActionState, String>(
  (ref, orderId) => DiagnosticReportController(ref, orderId),
);
