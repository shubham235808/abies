import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../domain/diagnostic_booking_args.dart';
import '../domain/diagnostic_booking_target.dart';
import '../domain/diagnostic_package_summary.dart';

/// Diagnostic package detail (docs/mobile/IMPLEMENTATION-PLAN.md Phase 6) —
/// same navigation-`extra` pattern as `DiagnosticTestDetailScreen`/Phase 5's
/// therapy detail screen, for the same reason (no
/// `GET /public/diagnostics/packages/[id]` exists).
class DiagnosticPackageDetailScreen extends StatelessWidget {
  const DiagnosticPackageDetailScreen({super.key, required this.package});

  final DiagnosticPackageSummary? package;

  @override
  Widget build(BuildContext context) {
    final package = this.package;
    return Scaffold(
      appBar: AppBar(title: const Text('Package')),
      body: package == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.info_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      "This package isn't available as a direct link yet — please open it from diagnostics search.",
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
                Text(package.name, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                if (package.labName != null) Text(package.labName!, style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 16),
                if (package.description != null && package.description!.isNotEmpty) ...[
                  Text(package.description!),
                  const SizedBox(height: 16),
                ],
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Chip(label: Text('₹${package.price}')),
                    if (package.labHomeCollectionSupported) const Chip(label: Text('Home collection available')),
                  ],
                ),
                if (package.testNames.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Includes', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  ...package.testNames.map((name) => Padding(padding: const EdgeInsets.only(top: 2), child: Text('• $name'))),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => context.push(
                    '/diagnostics/book',
                    extra: DiagnosticBookingArgs(target: DiagnosticBookingTarget.forPackage(package)),
                  ),
                  child: const Text('Book this package'),
                ),
              ],
            ),
    );
  }
}
