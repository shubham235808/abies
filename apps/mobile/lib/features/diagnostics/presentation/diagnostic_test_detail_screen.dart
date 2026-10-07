import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../domain/diagnostic_booking_args.dart';
import '../domain/diagnostic_booking_target.dart';
import '../domain/diagnostic_test_summary.dart';

/// Diagnostic test detail (docs/mobile/IMPLEMENTATION-PLAN.md Phase 6),
/// replacing the Phase 1 `/diagnostics/:id` placeholder.
///
/// **Reads from navigation `extra`, never re-fetches by id** — exactly
/// Phase 5's `PanchakarmaTherapyDetailScreen` pattern, for the exact same
/// reason: there is no `GET /public/diagnostics/[id]` to resolve an id
/// against (confirmed by reading every route under `.../api/v1/public/
/// diagnostics*`; a real, reported gap — see `DiagnosticTestSummary`'s doc
/// comment and `lib/features/diagnostics/PHASE.md`). The data is always the
/// exact object the search screen already fetched from the real API, never
/// invented or reconstructed. Opened without `extra` (a cold deep link with
/// no in-app navigation behind it) shows an honest explanation instead of
/// attempting a network call that doesn't exist.
class DiagnosticTestDetailScreen extends StatelessWidget {
  const DiagnosticTestDetailScreen({super.key, required this.test});

  final DiagnosticTestSummary? test;

  @override
  Widget build(BuildContext context) {
    final test = this.test;
    return Scaffold(
      appBar: AppBar(title: const Text('Test')),
      body: test == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.info_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      "This test isn't available as a direct link yet — please open it from diagnostics search.",
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: () => context.go('/diagnostics'), child: const Text('Go to search')),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(test.name, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                if (test.labName != null) Text(test.labName!, style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 16),
                if (test.description != null && test.description!.isNotEmpty) ...[
                  Text(test.description!),
                  const SizedBox(height: 16),
                ],
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Chip(label: Text('₹${test.price}')),
                    if (test.turnaroundHours != null) Chip(label: Text('${test.turnaroundHours}h turnaround')),
                    if (test.sampleType != null) Chip(label: Text(test.sampleType!)),
                    if (test.labHomeCollectionSupported) const Chip(label: Text('Home collection available')),
                  ],
                ),
                if (test.preparationInstructions != null && test.preparationInstructions!.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Preparation', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(test.preparationInstructions!),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => context.push(
                    '/diagnostics/book',
                    extra: DiagnosticBookingArgs(target: DiagnosticBookingTarget.forTests([test])),
                  ),
                  child: const Text('Book this test'),
                ),
              ],
            ),
    );
  }
}
