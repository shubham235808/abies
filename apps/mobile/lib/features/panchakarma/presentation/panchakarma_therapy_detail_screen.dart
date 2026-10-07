import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../domain/panchakarma_therapy.dart';

/// Panchakarma therapy detail (docs/mobile/IMPLEMENTATION-PLAN.md Phase 5),
/// replacing the Phase 1 `/panchakarma/:id` placeholder.
///
/// **Reads from navigation `extra`, never re-fetches by id** — unlike
/// `DoctorDetailScreen` (Phase 4), there is no `GET /public/panchakarma/
/// [id]` to resolve a slug/id against (confirmed by reading every route
/// under `.../api/v1/public/panchakarma*`; a real, reported gap, not an
/// oversight — see `PanchakarmaTherapy`'s doc comment and
/// `lib/features/panchakarma/PHASE.md`). The `:id` segment in this route's
/// path exists only so the URL is readable and the back stack is sane; the
/// actual data is always the exact object the search screen already fetched
/// from the real API and passed along, never invented or reconstructed.
/// Opened without `extra` (e.g. a cold deep link with no in-app navigation
/// behind it) — not supported in this phase — shows a clear, honest
/// explanation instead of attempting a network call that doesn't exist.
class PanchakarmaTherapyDetailScreen extends StatelessWidget {
  const PanchakarmaTherapyDetailScreen({super.key, required this.therapy});

  final PanchakarmaTherapy? therapy;

  @override
  Widget build(BuildContext context) {
    final therapy = this.therapy;
    return Scaffold(
      appBar: AppBar(title: const Text('Therapy')),
      body: therapy == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.info_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      "This therapy isn't available as a direct link yet — please open it from Panchakarma search.",
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: () => context.go('/panchakarma'), child: const Text('Go to search')),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(therapy.name, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                if (therapy.centreName != null)
                  Text(
                    [therapy.centreName, therapy.centreCity, therapy.centreState].whereType<String>().join(', '),
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                const SizedBox(height: 16),
                if (therapy.description != null && therapy.description!.isNotEmpty) ...[
                  Text(therapy.description!),
                  const SizedBox(height: 16),
                ],
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (therapy.durationMinutes != null) Chip(label: Text('${therapy.durationMinutes} min/session')),
                    Chip(label: Text('₹${therapy.price}/session')),
                    if (therapy.requiredSupervision) const Chip(label: Text('Requires supervision')),
                  ],
                ),
                if (therapy.prerequisites != null && therapy.prerequisites!.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Prerequisites', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(therapy.prerequisites!),
                ],
                if (therapy.contraindications != null && therapy.contraindications!.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Contraindications', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(therapy.contraindications!),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => context.push('/panchakarma/book', extra: therapy),
                  child: const Text('Book this therapy'),
                ),
              ],
            ),
    );
  }
}
