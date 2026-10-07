import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/medicine_facets.dart';
import '../domain/medicine_summary.dart';
import 'medicine_search_controller.dart';

/// The real medicine catalogue/search screen (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 7), replacing the home dashboard's `area`+
/// `limit`-only preview row. `GET /api/v1/public/medicines`, OTC-only (see
/// `MedicineSummary`'s doc comment) — a prescription-gated medicine is never
/// shown here; it only ever appears through "My prescriptions".
class MedicineSearchScreen extends StatelessWidget {
  const MedicineSearchScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Medicines'),
        actions: [
          IconButton(
            icon: const Icon(Icons.assignment_outlined),
            tooltip: 'My prescriptions',
            onPressed: () => context.push('/prescriptions'),
          ),
          IconButton(
            icon: const Icon(Icons.receipt_long_outlined),
            tooltip: 'My orders',
            onPressed: () => context.push('/pharmacy/orders'),
          ),
          IconButton(
            icon: const Icon(Icons.shopping_cart_outlined),
            tooltip: 'Cart',
            onPressed: () => context.push('/pharmacy/cart'),
          ),
        ],
      ),
      body: const _SearchBody(),
    );
  }
}

class _SearchBody extends ConsumerStatefulWidget {
  const _SearchBody();

  @override
  ConsumerState<_SearchBody> createState() => _SearchBodyState();
}

class _SearchBodyState extends ConsumerState<_SearchBody> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _submitQuery() {
    final current = ref.read(medicineSearchControllerProvider.notifier).filters;
    ref.read(medicineSearchControllerProvider.notifier).applyFilters(
          current.copyWith(q: () => _searchController.text.trim().isEmpty ? null : _searchController.text.trim()),
        );
  }

  Future<void> _openFilters() async {
    final facets = ref.read(medicineFacetsProvider).value ?? MedicineFacets.empty;
    final current = ref.read(medicineSearchControllerProvider.notifier).filters;
    final result = await showModalBottomSheet<MedicineSearchFilters>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _FilterSheet(initial: current, facets: facets),
    );
    if (result != null) {
      await ref.read(medicineSearchControllerProvider.notifier).applyFilters(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(medicineFacetsProvider);
    final resultAsync = ref.watch(medicineSearchControllerProvider);
    final controller = ref.read(medicineSearchControllerProvider.notifier);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _submitQuery(),
                  decoration: InputDecoration(
                    hintText: 'Search medicines…',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _submitQuery),
                  ),
                ),
              ),
              IconButton(icon: const Icon(Icons.filter_list), tooltip: 'Filters', onPressed: _openFilters),
            ],
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
              message: error is ApiException ? error.message : 'Could not load medicines.',
              onRetry: controller.retry,
            ),
            data: (result) => result.medicines.isEmpty
                ? const EmptyStateView(message: 'No medicines match your search.', icon: Icons.search_off)
                : RefreshIndicator(
                    onRefresh: controller.retry,
                    child: GridView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        childAspectRatio: 0.78,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                      itemCount: result.medicines.length + (controller.hasMore ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (i >= result.medicines.length) {
                          return Center(child: OutlinedButton(onPressed: controller.loadMore, child: const Text('Load more')));
                        }
                        final medicine = result.medicines[i];
                        return _MedicineCard(medicine: medicine);
                      },
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}

class _MedicineCard extends StatelessWidget {
  const _MedicineCard({required this.medicine});

  final MedicineSummary medicine;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/pharmacy/medicine/${medicine.medicineId}', extra: medicine),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.medication_outlined, size: 32),
              const SizedBox(height: 8),
              Text(medicine.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodyMedium),
              if (medicine.brandName != null)
                Text(medicine.brandName!, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
              if (medicine.pharmacyName != null)
                Text(
                  medicine.pharmacyName!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              const Spacer(),
              Row(
                children: [
                  Text('₹${medicine.price}', style: Theme.of(context).textTheme.titleSmall),
                  const Spacer(),
                  if (medicine.reviewCount > 0) Text('★ ${medicine.rating.toStringAsFixed(1)}'),
                ],
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

  final MedicineSearchFilters initial;
  final MedicineFacets facets;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String? _area = widget.initial.area;
  late String? _category = widget.initial.category;
  late String? _brand = widget.initial.brand;
  late bool? _isFmcg = widget.initial.isFmcg;

  @override
  Widget build(BuildContext context) {
    final safeArea = _area != null && widget.facets.areas.contains(_area) ? _area : null;
    final safeCategory = _category != null && widget.facets.categories.contains(_category) ? _category : null;
    final safeBrand = _brand != null && widget.facets.brands.contains(_brand) ? _brand : null;
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
              initialValue: safeArea,
              decoration: const InputDecoration(labelText: 'Area', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: null, child: Text('Any')),
                ...widget.facets.areas.map((a) => DropdownMenuItem(value: a, child: Text(a))),
              ],
              onChanged: (v) => setState(() => _area = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: safeCategory,
              decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: null, child: Text('Any')),
                ...widget.facets.categories.map((c) => DropdownMenuItem(value: c, child: Text(c))),
              ],
              onChanged: (v) => setState(() => _category = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: safeBrand,
              decoration: const InputDecoration(labelText: 'Brand', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: null, child: Text('Any')),
                ...widget.facets.brands.map((b) => DropdownMenuItem(value: b, child: Text(b))),
              ],
              onChanged: (v) => setState(() => _brand = v),
            ),
            const SizedBox(height: 12),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('FMCG only'),
              value: _isFmcg ?? false,
              onChanged: (v) => setState(() => _isFmcg = (v ?? false) ? true : null),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(const MedicineSearchFilters()),
                    child: const Text('Clear all'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(
                      MedicineSearchFilters(q: widget.initial.q, area: _area, category: _category, brand: _brand, isFmcg: _isFmcg),
                    ),
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
