import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/diagnostic_booking_args.dart';
import '../domain/diagnostic_booking_target.dart';
import '../domain/diagnostic_facets.dart';
import '../domain/diagnostic_package_summary.dart';
import '../domain/diagnostic_test_summary.dart';
import 'diagnostics_search_controller.dart';

/// The real diagnostics search/discovery screen (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 6), replacing the home dashboard's `city`+
/// `limit`-only preview row. Two tabs — individual tests
/// (`GET /api/v1/public/diagnostics`) and packages
/// (`GET /api/v1/public/diagnostics/packages`) — since those are genuinely
/// different endpoints/result shapes (see `DiagnosticPackageSearchResult`'s
/// doc comment), not one list with a type filter.
class DiagnosticsSearchScreen extends StatelessWidget {
  const DiagnosticsSearchScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Diagnostics'),
          actions: [
            IconButton(
              icon: const Icon(Icons.assignment_outlined),
              tooltip: 'My recommendations',
              onPressed: () => context.push('/diagnostics/recommendations'),
            ),
            IconButton(
              icon: const Icon(Icons.receipt_long_outlined),
              tooltip: 'My orders',
              onPressed: () => context.push('/diagnostics/orders'),
            ),
          ],
          bottom: const TabBar(tabs: [Tab(text: 'Tests'), Tab(text: 'Packages')]),
        ),
        body: const TabBarView(children: [_TestsTab(), _PackagesTab()]),
      ),
    );
  }
}

class _TestsTab extends ConsumerStatefulWidget {
  const _TestsTab();

  @override
  ConsumerState<_TestsTab> createState() => _TestsTabState();
}

class _TestsTabState extends ConsumerState<_TestsTab> {
  final _searchController = TextEditingController();
  bool _selectMode = false;
  final Map<String, DiagnosticTestSummary> _selected = {};

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _submitQuery() {
    final current = ref.read(diagnosticTestSearchControllerProvider.notifier).filters;
    ref.read(diagnosticTestSearchControllerProvider.notifier).applyFilters(
          current.copyWith(q: () => _searchController.text.trim().isEmpty ? null : _searchController.text.trim()),
        );
  }

  Future<void> _openFilters() async {
    final facets = ref.read(diagnosticFacetsProvider).value ?? DiagnosticFacets.empty;
    final current = ref.read(diagnosticTestSearchControllerProvider.notifier).filters;
    final result = await showModalBottomSheet<DiagnosticSearchFilters>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _FilterSheet(initial: current, facets: facets),
    );
    if (result != null) {
      await ref.read(diagnosticTestSearchControllerProvider.notifier).applyFilters(result);
    }
  }

  void _toggleSelect(DiagnosticTestSummary test) {
    setState(() {
      if (_selected.containsKey(test.id)) {
        _selected.remove(test.id);
      } else {
        _selected[test.id] = test;
      }
    });
  }

  void _bookSelected() {
    final tests = _selected.values.toList();
    final target = DiagnosticBookingTarget.forTests(tests);
    context.push('/diagnostics/book', extra: DiagnosticBookingArgs(target: target));
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(diagnosticFacetsProvider);
    final resultAsync = ref.watch(diagnosticTestSearchControllerProvider);
    final controller = ref.read(diagnosticTestSearchControllerProvider.notifier);

    final labIds = _selected.values.map((t) => t.labId).toSet();
    final sameLab = labIds.length <= 1;

    return Scaffold(
      body: Column(
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
                      hintText: 'Search tests…',
                      prefixIcon: const Icon(Icons.search),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _submitQuery),
                    ),
                  ),
                ),
                IconButton(icon: const Icon(Icons.filter_list), tooltip: 'Filters', onPressed: _openFilters),
                IconButton(
                  icon: Icon(_selectMode ? Icons.close : Icons.checklist),
                  tooltip: _selectMode ? 'Cancel selection' : 'Select multiple tests',
                  onPressed: () => setState(() {
                    _selectMode = !_selectMode;
                    if (!_selectMode) _selected.clear();
                  }),
                ),
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
                message: error is ApiException ? error.message : 'Could not load diagnostic tests.',
                onRetry: controller.retry,
              ),
              data: (result) => result.tests.isEmpty
                  ? const EmptyStateView(message: 'No diagnostic tests match your search.', icon: Icons.search_off)
                  : RefreshIndicator(
                      onRefresh: controller.retry,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        itemCount: result.tests.length + (controller.hasMore ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i >= result.tests.length) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Center(child: OutlinedButton(onPressed: controller.loadMore, child: const Text('Load more'))),
                            );
                          }
                          final test = result.tests[i];
                          return _TestResultCard(
                            test: test,
                            selectMode: _selectMode,
                            selected: _selected.containsKey(test.id),
                            onTap: () {
                              if (_selectMode) {
                                _toggleSelect(test);
                              } else {
                                context.push('/diagnostics/test/${test.id}', extra: test);
                              }
                            },
                          );
                        },
                      ),
                    ),
            ),
          ),
        ],
      ),
      floatingActionButton: _selectMode && _selected.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: sameLab ? _bookSelected : null,
              icon: const Icon(Icons.shopping_cart_checkout),
              label: Text(sameLab ? 'Book ${_selected.length} test${_selected.length == 1 ? '' : 's'}' : 'Pick tests from one lab'),
            )
          : null,
    );
  }
}

class _TestResultCard extends StatelessWidget {
  const _TestResultCard({required this.test, required this.selectMode, required this.selected, required this.onTap});

  final DiagnosticTestSummary test;
  final bool selectMode;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (selectMode)
                Checkbox(value: selected, onChanged: (_) => onTap())
              else
                const CircleAvatar(radius: 28, child: Icon(Icons.biotech_outlined)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(test.name, style: Theme.of(context).textTheme.titleMedium),
                    if (test.labName != null) Text(test.labName!),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      children: [
                        Chip(label: Text('₹${test.price}')),
                        if (test.turnaroundHours != null) Chip(label: Text('${test.turnaroundHours}h report')),
                        if (test.labHomeCollectionSupported) const Chip(label: Text('Home collection')),
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

class _PackagesTab extends ConsumerStatefulWidget {
  const _PackagesTab();

  @override
  ConsumerState<_PackagesTab> createState() => _PackagesTabState();
}

class _PackagesTabState extends ConsumerState<_PackagesTab> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _submitQuery() {
    final current = ref.read(diagnosticPackageSearchControllerProvider.notifier).filters;
    ref.read(diagnosticPackageSearchControllerProvider.notifier).applyFilters(
          current.copyWith(q: () => _searchController.text.trim().isEmpty ? null : _searchController.text.trim()),
        );
  }

  Future<void> _openFilters() async {
    final facets = ref.read(diagnosticFacetsProvider).value ?? DiagnosticFacets.empty;
    final current = ref.read(diagnosticPackageSearchControllerProvider.notifier).filters;
    final result = await showModalBottomSheet<DiagnosticSearchFilters>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _FilterSheet(initial: current, facets: facets),
    );
    if (result != null) {
      await ref.read(diagnosticPackageSearchControllerProvider.notifier).applyFilters(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(diagnosticFacetsProvider);
    final resultAsync = ref.watch(diagnosticPackageSearchControllerProvider);
    final controller = ref.read(diagnosticPackageSearchControllerProvider.notifier);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _searchController,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _submitQuery(),
            decoration: InputDecoration(
              hintText: 'Search packages…',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              suffixIcon: IconButton(
                icon: const Icon(Icons.filter_list),
                onPressed: _openFilters,
              ),
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
              message: error is ApiException ? error.message : 'Could not load diagnostic packages.',
              onRetry: controller.retry,
            ),
            data: (result) => result.packages.isEmpty
                ? const EmptyStateView(message: 'No diagnostic packages match your search.', icon: Icons.search_off)
                : RefreshIndicator(
                    onRefresh: controller.retry,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      itemCount: result.packages.length + (controller.hasMore ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (i >= result.packages.length) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Center(child: OutlinedButton(onPressed: controller.loadMore, child: const Text('Load more'))),
                          );
                        }
                        final package = result.packages[i];
                        return _PackageResultCard(package: package);
                      },
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}

class _PackageResultCard extends StatelessWidget {
  const _PackageResultCard({required this.package});

  final DiagnosticPackageSummary package;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/diagnostics/package/${package.id}', extra: package),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CircleAvatar(radius: 28, child: Icon(Icons.biotech_outlined)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(package.name, style: Theme.of(context).textTheme.titleMedium),
                    if (package.labName != null) Text(package.labName!),
                    if (package.testNames.isNotEmpty)
                      Text(package.testNames.join(', '), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      children: [
                        Chip(label: Text('₹${package.price}')),
                        if (package.labHomeCollectionSupported) const Chip(label: Text('Home collection')),
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

  final DiagnosticSearchFilters initial;
  final DiagnosticFacets facets;

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
                    onPressed: () => Navigator.of(context).pop(const DiagnosticSearchFilters()),
                    child: const Text('Clear all'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(DiagnosticSearchFilters(q: widget.initial.q, city: _city)),
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
