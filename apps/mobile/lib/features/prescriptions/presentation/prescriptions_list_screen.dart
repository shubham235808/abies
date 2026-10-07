import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/prescription_summary.dart';
import 'prescriptions_controller.dart';

/// "My prescriptions" (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7) —
/// `GET /api/v1/patients/me/prescriptions`, finalized-only. Each card opens
/// the detail screen via `extra` (see `PrescriptionSummary`'s doc comment
/// for why — there is no `GET /prescriptions/[id]` to resolve one from
/// cold).
class PrescriptionsListScreen extends ConsumerWidget {
  const PrescriptionsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(prescriptionsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My prescriptions')),
      body: async.when(
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: 3,
          itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 96)),
        ),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your prescriptions.',
          onRetry: () => ref.read(prescriptionsControllerProvider.notifier).refresh(),
        ),
        data: (prescriptions) => prescriptions.isEmpty
            ? const EmptyStateView(message: 'No finalized prescriptions yet.', icon: Icons.assignment_outlined)
            : RefreshIndicator(
                onRefresh: () => ref.read(prescriptionsControllerProvider.notifier).refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: prescriptions.length,
                  itemBuilder: (context, i) => _PrescriptionCard(prescription: prescriptions[i]),
                ),
              ),
      ),
    );
  }
}

class _PrescriptionCard extends StatelessWidget {
  const _PrescriptionCard({required this.prescription});

  final PrescriptionSummary prescription;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/prescriptions/${prescription.id}', extra: prescription),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                prescription.items.map((i) => i.productName).join(', '),
                style: Theme.of(context).textTheme.titleMedium,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (prescription.doctorName != null) Text('Prescribed by ${prescription.doctorName}'),
              if (prescription.finalizedAt != null)
                Text('Finalized ${_formatDate(prescription.finalizedAt!)}', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

String _formatDate(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
}
