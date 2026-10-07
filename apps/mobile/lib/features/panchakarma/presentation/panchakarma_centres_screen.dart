import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/panchakarma_centre.dart';
import '../domain/panchakarma_facets.dart';
import 'panchakarma_search_controller.dart';

/// `GET /api/v1/public/panchakarma-centres` — centre-centric browse list
/// (docs/mobile/IMPLEMENTATION-PLAN.md Phase 5), a *different* path and a
/// *different* shape than `/public/panchakarma`'s therapy-centric search
/// (confirmed by reading both routes — see `PanchakarmaCentre`'s doc
/// comment).
///
/// **Deliberately not tappable into a detail screen** — there is no public
/// single-centre detail route under `apps/platform-api/src/app/api/v1/
/// public/panchakarma*` (checked `/public/panchakarma-centres/[id]` and
/// every sibling path; none exists). Building a fake "detail" by filtering
/// the therapy search down to this centre's id would only look like a
/// detail screen while quietly depending on `/public/panchakarma`'s own
/// unrelated `q`/`city` filters, not an actual per-centre contract — this
/// phase reports that gap instead (see `lib/features/panchakarma/PHASE.md`
/// and docs/mobile/IMPLEMENTATION-PLAN.md's Phase 5 entry).
class PanchakarmaCentresScreen extends ConsumerStatefulWidget {
  const PanchakarmaCentresScreen({super.key});

  @override
  ConsumerState<PanchakarmaCentresScreen> createState() => _PanchakarmaCentresScreenState();
}

class _PanchakarmaCentresScreenState extends ConsumerState<PanchakarmaCentresScreen> {
  String? _city;

  @override
  Widget build(BuildContext context) {
    final facets = ref.watch(panchakarmaFacetsProvider).value ?? PanchakarmaFacets.empty;
    final centresAsync = ref.watch(panchakarmaCentresProvider(_city));

    return Scaffold(
      appBar: AppBar(title: const Text('Panchakarma centres')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: DropdownButtonFormField<String>(
              initialValue: _city != null && facets.cities.contains(_city) ? _city : null,
              decoration: const InputDecoration(labelText: 'City', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: null, child: Text('All cities')),
                ...facets.cities.map((c) => DropdownMenuItem(value: c, child: Text(c))),
              ],
              onChanged: (v) => setState(() => _city = v),
            ),
          ),
          Expanded(
            child: centresAsync.when(
              loading: () => ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: 4,
                itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 72)),
              ),
              error: (error, _) => ErrorStateView(
                message: error is ApiException ? error.message : 'Could not load Panchakarma centres.',
                onRetry: () => ref.invalidate(panchakarmaCentresProvider(_city)),
              ),
              data: (centres) => centres.isEmpty
                  ? const EmptyStateView(message: 'No approved Panchakarma centres found.', icon: Icons.search_off)
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      itemCount: centres.length,
                      itemBuilder: (context, i) => _CentreCard(centre: centres[i]),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CentreCard extends StatelessWidget {
  const _CentreCard({required this.centre});

  final PanchakarmaCentre centre;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: const Icon(Icons.local_hospital_outlined),
        title: Text(centre.name ?? 'Panchakarma centre'),
        subtitle: Text([centre.city, centre.state].whereType<String>().join(', ')),
      ),
    );
  }
}
