import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/doctor_facets.dart';
import '../domain/doctor_summary.dart';
import 'doctors_controller.dart';

/// The real doctor search/discovery screen (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 4), replacing "no search bar, no facets/
/// filters" from Phase 3's own "still not this phase" note. Consumes
/// `GET /api/v1/public/doctors` (full filter set) and `/facets`.
class DoctorSearchScreen extends ConsumerStatefulWidget {
  const DoctorSearchScreen({super.key});

  @override
  ConsumerState<DoctorSearchScreen> createState() => _DoctorSearchScreenState();
}

class _DoctorSearchScreenState extends ConsumerState<DoctorSearchScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _submitQuery() {
    final current = ref.read(doctorSearchControllerProvider.notifier).filters;
    ref.read(doctorSearchControllerProvider.notifier).applyFilters(
          current.copyWith(q: () => _searchController.text.trim().isEmpty ? null : _searchController.text.trim()),
        );
  }

  Future<void> _openFilters() async {
    final facetsAsync = ref.read(doctorFacetsProvider);
    final facets = facetsAsync.value ?? DoctorFacets.empty;
    final current = ref.read(doctorSearchControllerProvider.notifier).filters;
    final result = await showModalBottomSheet<DoctorSearchFilters>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _FilterSheet(initial: current, facets: facets),
    );
    if (result != null) {
      await ref.read(doctorSearchControllerProvider.notifier).applyFilters(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Triggers the facets fetch once up front so the filter sheet opens
    // instantly later; not awaited here — the sheet itself falls back to an
    // empty facets set gracefully if it's still loading.
    ref.watch(doctorFacetsProvider);
    final resultAsync = ref.watch(doctorSearchControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Find a doctor'),
        actions: [
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
                hintText: 'Search by name, specialty, qualification…',
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
                message: error is ApiException ? error.message : 'Could not load doctors.',
                onRetry: () => ref.read(doctorSearchControllerProvider.notifier).retry(),
              ),
              data: (result) => result.doctors.isEmpty
                  ? const EmptyStateView(message: 'No doctors match your search.', icon: Icons.search_off)
                  : RefreshIndicator(
                      onRefresh: () => ref.read(doctorSearchControllerProvider.notifier).retry(),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        itemCount: result.doctors.length + (result.hasMore ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i >= result.doctors.length) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Center(
                                child: OutlinedButton(
                                  onPressed: () => ref.read(doctorSearchControllerProvider.notifier).loadMore(),
                                  child: const Text('Load more'),
                                ),
                              ),
                            );
                          }
                          return _DoctorResultCard(doctor: result.doctors[i]);
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

class _DoctorResultCard extends StatelessWidget {
  const _DoctorResultCard({required this.doctor});

  final DoctorSummary doctor;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/doctor/${doctor.slug}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(radius: 28, child: Text(doctor.name.isNotEmpty ? doctor.name.substring(0, 1) : '?')),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(doctor.name, style: Theme.of(context).textTheme.titleMedium),
                    if (doctor.specialties.isNotEmpty) Text(doctor.specialties.join(', ')),
                    if (doctor.primaryQualification != null) Text(doctor.primaryQualification!, style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (doctor.rating > 0) Chip(label: Text('★ ${doctor.rating.toStringAsFixed(1)} (${doctor.reviewCount})')),
                        if (doctor.city != null) Chip(label: Text(doctor.city!)),
                        if (doctor.languageMatch == true) const Chip(label: Text('Speaks your language')),
                        if (doctor.startingFee != null) Chip(label: Text('From ₹${doctor.startingFee}')),
                        if (!doctor.acceptingNewPatients) const Chip(label: Text('Not accepting new patients')),
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

  final DoctorSearchFilters initial;
  final DoctorFacets facets;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String? _city = widget.initial.city;
  late String? _specialty = widget.initial.specialty;
  late String? _language = widget.initial.language;
  late String? _mode = widget.initial.mode;
  late bool _acceptingOnly = widget.initial.accepting == true;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filters', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            _OptionDropdown(label: 'City', value: _city, options: widget.facets.cities, onChanged: (v) => setState(() => _city = v)),
            const SizedBox(height: 12),
            _OptionDropdown(label: 'Specialty', value: _specialty, options: widget.facets.specialties, onChanged: (v) => setState(() => _specialty = v)),
            const SizedBox(height: 12),
            _OptionDropdown(label: 'Language', value: _language, options: widget.facets.languages, onChanged: (v) => setState(() => _language = v)),
            const SizedBox(height: 12),
            _OptionDropdown(label: 'Consultation mode', value: _mode, options: const ['VIDEO', 'CLINIC'], onChanged: (v) => setState(() => _mode = v)),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Accepting new patients only'),
              value: _acceptingOnly,
              onChanged: (v) => setState(() => _acceptingOnly = v),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(const DoctorSearchFilters()),
                    child: const Text('Clear all'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(DoctorSearchFilters(
                      q: widget.initial.q,
                      city: _city,
                      specialty: _specialty,
                      language: _language,
                      mode: _mode,
                      accepting: _acceptingOnly ? true : null,
                    )),
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

class _OptionDropdown extends StatelessWidget {
  const _OptionDropdown({required this.label, required this.value, required this.options, required this.onChanged});

  final String label;
  final String? value;
  final List<String> options;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final safeValue = value != null && options.contains(value) ? value : null;
    return DropdownButtonFormField<String>(
      initialValue: safeValue,
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
      items: [
        const DropdownMenuItem(value: null, child: Text('Any')),
        ...options.map((o) => DropdownMenuItem(value: o, child: Text(o))),
      ],
      onChanged: onChanged,
    );
  }
}
