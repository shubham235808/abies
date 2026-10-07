import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/diagnostic_booking_args.dart';
import '../domain/diagnostic_booking_target.dart';
import '../domain/diagnostic_package_summary.dart';
import '../domain/diagnostic_recommendation.dart';
import '../domain/diagnostic_test_summary.dart';
import 'diagnostic_recommendations_controller.dart';

/// "My diagnostic recommendations" (docs/mobile/IMPLEMENTATION-PLAN.md Phase
/// 6) — a doctor-initiated recommendation to get a test/package done, shown
/// with a "Book from this recommendation" action.
///
/// **No cancel action on this screen, deliberately** — a real gap, not an
/// oversight: `POST /api/v1/diagnostic-recommendations/[id]/cancel` is
/// doctor-only (confirmed by reading the real route's
/// `requireRole(ctx, 'DOCTOR')` and `cancelRecommendation()`'s own
/// doctor-ownership check — see `DiagnosticRecommendation`'s doc comment).
/// Building a cancel button here would only ever surface a 403; this screen
/// reports that gap instead (`lib/features/diagnostics/PHASE.md`).
class DiagnosticRecommendationsScreen extends ConsumerWidget {
  const DiagnosticRecommendationsScreen({super.key});

  Future<void> _bookFrom(BuildContext context, WidgetRef ref, DiagnosticRecommendation recommendation) async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => const AlertDialog(content: SizedBox(height: 80, child: Center(child: CircularProgressIndicator()))),
    );
    List<Object> options;
    try {
      options = await ref.read(diagnosticRecommendationsControllerProvider.notifier).findBookableOptions(recommendation);
    } catch (_) {
      options = const [];
    }
    if (!context.mounted) return;
    Navigator.of(context).pop(); // close the loading dialog
    if (options.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No lab currently offers this — please try diagnostics search directly.')),
      );
      return;
    }
    if (!context.mounted) return;
    if (options.length == 1) {
      _navigateToBooking(context, options.first, recommendation.id);
      return;
    }
    if (!context.mounted) return;
    final chosen = await showModalBottomSheet<Object>(
      context: context,
      builder: (context) => _OptionsPickerSheet(options: options),
    );
    if (chosen != null && context.mounted) {
      _navigateToBooking(context, chosen, recommendation.id);
    }
  }

  void _navigateToBooking(BuildContext context, Object option, String recommendationId) {
    final target = option is DiagnosticPackageSummary
        ? DiagnosticBookingTarget.forPackage(option)
        : DiagnosticBookingTarget.forTests([option as DiagnosticTestSummary]);
    context.push('/diagnostics/book', extra: DiagnosticBookingArgs(target: target, recommendationId: recommendationId));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(diagnosticRecommendationsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My recommendations')),
      body: async.when(
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: 3,
          itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 96)),
        ),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your recommendations.',
          onRetry: () => ref.read(diagnosticRecommendationsControllerProvider.notifier).refresh(),
        ),
        data: (recommendations) => recommendations.isEmpty
            ? const EmptyStateView(message: 'No diagnostic recommendations yet.', icon: Icons.assignment_outlined)
            : RefreshIndicator(
                onRefresh: () => ref.read(diagnosticRecommendationsControllerProvider.notifier).refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: recommendations.length,
                  itemBuilder: (context, i) {
                    final rec = recommendations[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text(rec.itemName, style: Theme.of(context).textTheme.titleMedium)),
                                Chip(label: Text(_statusLabel(rec.status))),
                              ],
                            ),
                            if (rec.doctorName != null) Text('Recommended by ${rec.doctorName}'),
                            if (rec.clinicalReason != null && rec.clinicalReason!.isNotEmpty)
                              Padding(padding: const EdgeInsets.only(top: 4), child: Text(rec.clinicalReason!)),
                            if (rec.canBookFrom) ...[
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.centerRight,
                                child: FilledButton.tonal(
                                  onPressed: () => _bookFrom(context, ref, rec),
                                  child: const Text('Book from this recommendation'),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}

class _OptionsPickerSheet extends StatelessWidget {
  const _OptionsPickerSheet({required this.options});

  final List<Object> options;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: options.map((option) {
          if (option is DiagnosticPackageSummary) {
            return ListTile(
              title: Text(option.name),
              subtitle: Text(option.labName ?? ''),
              trailing: Text('₹${option.price}'),
              onTap: () => Navigator.of(context).pop(option),
            );
          }
          final test = option as DiagnosticTestSummary;
          return ListTile(
            title: Text(test.name),
            subtitle: Text(test.labName ?? ''),
            trailing: Text('₹${test.price}'),
            onTap: () => Navigator.of(context).pop(test),
          );
        }).toList(),
      ),
    );
  }
}

String _statusLabel(String status) {
  return status.split('_').map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}').join(' ');
}
