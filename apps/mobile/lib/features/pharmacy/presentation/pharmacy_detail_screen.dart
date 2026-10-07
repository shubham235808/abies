import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../domain/pharmacy_summary.dart';

/// Pharmacy detail — reads from navigation `extra`, never re-fetches by id,
/// same already-known gap as `MedicineDetailScreen` (no `GET /public/
/// pharmacies/[id]` — confirmed by reading every route under `.../api/v1/
/// public/pharmacies*`). Reached by tapping a medicine's pharmacy name on
/// `MedicineDetailScreen`. There's no separate pharmacy-scoped catalogue
/// browse in this phase — the medicine catalogue search (`area` filter) and
/// the prescription pharmacy-picker are this app's two real ways to find a
/// pharmacy's stock, same economy of screens Phase 5/6 used for
/// centres/labs with no detail route of their own.
class PharmacyDetailScreen extends StatelessWidget {
  const PharmacyDetailScreen({super.key, required this.pharmacy});

  final PharmacySummary? pharmacy;

  @override
  Widget build(BuildContext context) {
    final pharmacy = this.pharmacy;
    return Scaffold(
      appBar: AppBar(title: const Text('Pharmacy')),
      body: pharmacy == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.info_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      "This pharmacy isn't available as a direct link yet — please open it from a medicine's detail page.",
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: () => context.go('/pharmacy'), child: const Text('Go to catalogue')),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(pharmacy.name ?? 'Pharmacy', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 12),
                if (pharmacy.serviceAreas.isNotEmpty) ...[
                  Text('Service areas', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: pharmacy.serviceAreas.map((a) => Chip(label: Text(a))).toList()),
                ],
              ],
            ),
    );
  }
}
