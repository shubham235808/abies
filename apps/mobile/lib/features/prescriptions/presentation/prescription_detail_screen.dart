import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../domain/prescription_summary.dart';

/// Prescription detail — reads from navigation `extra`, never re-fetches by
/// id (see `PrescriptionSummary`'s doc comment: there is genuinely no
/// `GET /api/v1/prescriptions/[id]` for anyone, not even doctor-only — a
/// real, reported gap, not a worked-around one). The list endpoint's own
/// per-row shape already carries every item field this screen shows, so
/// there is nothing this screen is missing by not re-fetching.
///
/// **No document viewer** — a `Prescription` has no attached file field at
/// all (`packages/domain/prisma/schema.prisma`); this screen shows only the
/// structured fields the backend actually has.
class PrescriptionDetailScreen extends StatelessWidget {
  const PrescriptionDetailScreen({super.key, required this.prescription});

  final PrescriptionSummary? prescription;

  @override
  Widget build(BuildContext context) {
    final prescription = this.prescription;
    return Scaffold(
      appBar: AppBar(title: const Text('Prescription')),
      body: prescription == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.info_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      "This prescription isn't available as a direct link yet — please open it from My prescriptions.",
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: () => context.go('/prescriptions'), child: const Text('Go to prescriptions')),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (prescription.doctorName != null) Text('Prescribed by ${prescription.doctorName}', style: Theme.of(context).textTheme.titleMedium),
                if (prescription.finalizedAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Finalized ${_formatDate(prescription.finalizedAt!)}', style: Theme.of(context).textTheme.bodySmall),
                  ),
                if (prescription.doctorNotes != null && prescription.doctorNotes!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('Notes', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(prescription.doctorNotes!),
                ],
                const SizedBox(height: 16),
                Text('Medicines', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                ...prescription.items.map(
                  (item) => Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.productName, style: Theme.of(context).textTheme.titleSmall),
                          Wrap(
                            spacing: 8,
                            children: [
                              if (item.dosage != null) Text(item.dosage!),
                              if (item.frequency != null) Text(item.frequency!),
                              if (item.durationDays != null) Text('${item.durationDays} days'),
                              if (item.route != null) Text(item.route!),
                            ],
                          ),
                          if (item.instructions != null && item.instructions!.isNotEmpty)
                            Padding(padding: const EdgeInsets.only(top: 4), child: Text(item.instructions!)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.push('/prescriptions/${prescription.id}/purchase', extra: prescription),
                  icon: const Icon(Icons.local_pharmacy_outlined),
                  label: const Text('Order these medicines'),
                ),
              ],
            ),
    );
  }
}

String _formatDate(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
}
