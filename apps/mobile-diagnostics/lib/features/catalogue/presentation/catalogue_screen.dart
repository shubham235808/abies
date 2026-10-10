import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/util/formatting.dart';
import '../../../shared/widgets/state_views.dart';
import '../../orders/presentation/dashboard_screen.dart' show errorMessage;
import '../domain/catalogue.dart';
import 'catalogue_controller.dart';

/// Port of apps/partner-web/src/app/partner/lab/tests/{tests,packages}-manager.tsx:
/// list, activate/deactivate, delete, plus create/edit forms.
class CatalogueScreen extends ConsumerWidget {
  const CatalogueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(catalogueControllerProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Test catalogue'),
          bottom: const TabBar(tabs: [Tab(text: 'Tests'), Tab(text: 'Packages')]),
        ),
        floatingActionButton: Builder(
          builder: (ctx) => FloatingActionButton.extended(
            icon: const Icon(Icons.add),
            label: const Text('Add'),
            onPressed: () {
              final tab = DefaultTabController.of(ctx).index;
              if (tab == 0) {
                ctx.push('/catalogue/test');
              } else if ((async.valueOrNull?.tests.isEmpty ?? true)) {
                ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Add at least one test before creating a package.')));
              } else {
                ctx.push('/catalogue/package');
              }
            },
          ),
        ),
        body: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorStateView(message: errorMessage(e), onRetry: () => ref.invalidate(catalogueControllerProvider)),
          data: (catalogue) => TabBarView(children: [
            _TestsList(tests: catalogue.tests),
            _PackagesList(packages: catalogue.packages),
          ]),
        ),
      ),
    );
  }
}

Future<void> _showResult(BuildContext context, String? error, String success) async {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? success)));
}

Future<bool> _confirmDelete(BuildContext context, String name) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Delete "$name"?'),
      content: const Text('This removes it from your catalogue permanently. Deactivate it instead to just hide it from patients.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
      ],
    ),
  );
  return ok == true;
}

class _TestsList extends ConsumerWidget {
  const _TestsList({required this.tests});

  final List<LabTest> tests;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (tests.isEmpty) return const EmptyStateView(message: 'No tests yet. Tap Add to create your first test.');
    final controller = ref.read(catalogueControllerProvider.notifier);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(catalogueControllerProvider.future),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
        itemCount: tests.length,
        itemBuilder: (context, i) {
          final t = tests[i];
          return Card(
            child: ListTile(
              title: Text('${t.name} (${t.code})'),
              subtitle: Text([
                formatRupees(t.price),
                if (t.turnaroundHours != null) '${t.turnaroundHours}h turnaround',
                t.active ? 'Active' : 'Inactive',
              ].join(' · ')),
              onTap: () => context.push('/catalogue/test', extra: t),
              trailing: PopupMenuButton<String>(
                onSelected: (v) async {
                  String? error;
                  if (v == 'toggle') {
                    error = await controller.setTestActive(t.id, !t.active);
                  } else if (v == 'delete') {
                    if (!await _confirmDelete(context, t.name)) return;
                    error = await controller.deleteTest(t.id);
                  }
                  if (context.mounted) await _showResult(context, error, v == 'delete' ? 'Test deleted' : 'Test updated');
                },
                itemBuilder: (_) => [
                  PopupMenuItem(value: 'toggle', child: Text(t.active ? 'Deactivate' : 'Activate')),
                  const PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PackagesList extends ConsumerWidget {
  const _PackagesList({required this.packages});

  final List<LabPackage> packages;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (packages.isEmpty) return const EmptyStateView(message: 'No packages yet. Bundle several of your tests at one price.');
    final controller = ref.read(catalogueControllerProvider.notifier);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(catalogueControllerProvider.future),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
        itemCount: packages.length,
        itemBuilder: (context, i) {
          final p = packages[i];
          return Card(
            child: ListTile(
              title: Text(p.name),
              subtitle: Text('${formatRupees(p.price)} · ${p.active ? 'Active' : 'Inactive'}\n${p.testNames.join(', ')}'),
              isThreeLine: true,
              onTap: () => context.push('/catalogue/package', extra: p),
              trailing: PopupMenuButton<String>(
                onSelected: (v) async {
                  String? error;
                  if (v == 'toggle') {
                    error = await controller.setPackageActive(p.id, !p.active);
                  } else if (v == 'delete') {
                    if (!await _confirmDelete(context, p.name)) return;
                    error = await controller.deletePackage(p.id);
                  }
                  if (context.mounted) await _showResult(context, error, v == 'delete' ? 'Package deleted' : 'Package updated');
                },
                itemBuilder: (_) => [
                  PopupMenuItem(value: 'toggle', child: Text(p.active ? 'Deactivate' : 'Activate')),
                  const PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
