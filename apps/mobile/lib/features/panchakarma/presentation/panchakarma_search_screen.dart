import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/panchakarma_facets.dart';
import '../domain/panchakarma_therapy.dart';
import 'panchakarma_search_controller.dart';

/// The real Panchakarma search/discovery screen (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 5), replacing the home dashboard's
/// `city`+`limit`-only preview row. Consumes `GET /api/v1/public/panchakarma`
/// (the real filter set — `q`/`city`) and `/facets`.
class PanchakarmaSearchScreen extends ConsumerStatefulWidget {
  const PanchakarmaSearchScreen({super.key});

  @override
  ConsumerState<PanchakarmaSearchScreen> createState() => _PanchakarmaSearchScreenState();
}

class _PanchakarmaSearchScreenState extends ConsumerState<PanchakarmaSearchScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _submitQuery() {
    final current = ref.read(panchakarmaSearchControllerProvider.notifier).filters;
    ref.read(panchakarmaSearchControllerProvider.notifier).applyFilters(
          current.copyWith(q: () => _searchController.text.trim().isEmpty ? null : _searchController.text.trim()),
        );
  }

  Future<void> _openFilters() async {
    final facets = ref.read(panchakarmaFacetsProvider).value ?? PanchakarmaFacets.empty;
    final current = ref.read(panchakarmaSearchControllerProvider.notifier).filters;
    final result = await showModalBottomSheet<PanchakarmaSearchFilters>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _FilterSheet(initial: current, facets: facets),
    );
    if (result != null) {
      await ref.read(panchakarmaSearchControllerProvider.notifier).applyFilters(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Triggers the facets fetch once up front, same pattern as
    // `DoctorSearchScreen` — the sheet falls back to an empty set gracefully
    // if it's still loading.
    ref.watch(panchakarmaFacetsProvider);
    final resultAsync = ref.watch(panchakarmaSearchControllerProvider);
    final controller = ref.read(panchakarmaSearchControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Panchakarma'),
        actions: [
          IconButton(
            icon: const Icon(Icons.local_hospital_outlined),
            tooltip: 'Centres',
            onPressed: () => context.push('/panchakarma/centres'),
          ),
          IconButton(icon: const Icon(Icons.filter_list), tooltip: 'Filters', onPressed: _openFilters),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _submitQuery(),
              decoration: InputDecoration(
                hintText: 'Search therapies…',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _submitQuery),
              ),
            ),
          ),
          Expanded(
            child: resultAsync.when(
              loading: () => ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: 4,
                itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 96)),
              ),
              error: (error, _) => ErrorStateView(
                message: error is ApiException ? error.message : 'Could not load Panchakarma therapies.',
                onRetry: controller.retry,
              ),
              data: (result) => result.therapies.isEmpty
                  ? const EmptyStateView(message: 'No Panchakarma therapies match your search.', icon: Icons.search_off)
                  : RefreshIndicator(
                      onRefresh: controller.retry,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        itemCount: result.therapies.length + (controller.hasMore ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i >= result.therapies.length) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Center(child: OutlinedButton(onPressed: controller.loadMore, child: const Text('Load more'))),
                            );
                          }
                          return _TherapyResultCard(therapy: result.therapies[i]);
                        },
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TherapyResultCard extends StatelessWidget {
  const _TherapyResultCard({required this.therapy});

  final PanchakarmaTherapy therapy;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/panchakarma/therapy/${therapy.id}', extra: therapy),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CircleAvatar(radius: 28, child: Icon(Icons.spa_outlined)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(therapy.name, style: Theme.of(context).textTheme.titleMedium),
                    if (therapy.centreName != null) Text(therapy.centreName!),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (therapy.durationMinutes != null) Chip(label: Text('${therapy.durationMinutes} min')),
                        Chip(label: Text('₹${therapy.price}/session')),
                        if (therapy.centreCity != null) Chip(label: Text(therapy.centreCity!)),
                        if (therapy.requiredSupervision) const Chip(label: Text('Supervised')),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial, required this.facets});

  final PanchakarmaSearchFilters initial;
  final PanchakarmaFacets facets;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String? _city = widget.initial.city;

  @override
  Widget build(BuildContext context) {
    final safeCity = _city != null && widget.facets.cities.contains(_city) ? _city : null;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filters', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: safeCity,
              decoration: const InputDecoration(labelText: 'City', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: null, child: Text('Any')),
                ...widget.facets.cities.map((c) => DropdownMenuItem(value: c, child: Text(c))),
              ],
              onChanged: (v) => setState(() => _city = v),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(const PanchakarmaSearchFilters()),
                    child: const Text('Clear all'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(PanchakarmaSearchFilters(q: widget.initial.q, city: _city)),
                    child: const Text('Apply'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
