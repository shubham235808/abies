import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/doctor_profile.dart';
import 'availability_controller.dart';

/// Weekly recurring availability — port of apps/partner-web/src/app/partner/
/// doctor/availability. Patients book slots generated from these windows.
class AvailabilityScreen extends ConsumerWidget {
  const AvailabilityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(availabilityControllerProvider);
    ref.listen(availabilityControllerProvider.select((s) => s.valueOrNull?.error), (_, error) {
      if (error != null) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
    });
    return Scaffold(
      appBar: AppBar(title: const Text('Availability')),
      floatingActionButton: async.valueOrNull == null || async.value!.enabledModes.isEmpty
          ? null
          : FloatingActionButton.extended(
              icon: const Icon(Icons.add),
              label: const Text('Add window'),
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => _AddWindowSheet(state: async.value!),
              ),
            ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: e is ApiException ? e.message : 'Could not load your availability.',
          onRetry: () => ref.invalidate(availabilityControllerProvider),
        ),
        data: (state) {
          final clinicNames = {for (final c in state.profile.clinics) c.id: c.name};
          return Stack(
            children: [
              if (state.windows.isEmpty)
                const EmptyStateView(message: 'No availability yet. Add a weekly window so patients can book you.', icon: Icons.event_busy)
              else
                ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    Text('Weekly recurring windows. Only modes enabled on your profile can be added.',
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 8),
                    for (final w in state.windows) _WindowTile(window: w, clinicName: clinicNames[w.clinicId], busy: state.busy),
                  ],
                ),
              if (state.busy) const Positioned(top: 0, left: 0, right: 0, child: LinearProgressIndicator()),
            ],
          );
        },
      ),
    );
  }
}

class _WindowTile extends ConsumerWidget {
  const _WindowTile({required this.window, required this.clinicName, required this.busy});

  final AvailabilityWindow window;
  final String? clinicName;
  final bool busy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(availabilityControllerProvider.notifier);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text('${weekdayNames[window.dayOfWeek]} · ${window.startTime}–${window.endTime}'),
        subtitle: Text('${window.slotMinutes}-min slots · ${window.mode == 'VIDEO' ? 'Video' : 'Clinic${clinicName != null ? ' — $clinicName' : ''}'}'
            '${window.active ? '' : ' · paused'}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Switch(value: window.active, onChanged: busy ? null : (v) => notifier.setActive(window.id, v)),
            IconButton(
              tooltip: 'Remove',
              icon: const Icon(Icons.delete_outline),
              onPressed: busy
                  ? null
                  : () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: const Text('Remove this window?'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove')),
                          ],
                        ),
                      );
                      if (ok == true) await notifier.remove(window.id);
                    },
            ),
          ],
        ),
      ),
    );
  }
}

class _AddWindowSheet extends ConsumerStatefulWidget {
  const _AddWindowSheet({required this.state});

  final AvailabilityState state;

  @override
  ConsumerState<_AddWindowSheet> createState() => _AddWindowSheetState();
}

class _AddWindowSheetState extends ConsumerState<_AddWindowSheet> {
  int _day = 1;
  TimeOfDay _start = const TimeOfDay(hour: 10, minute: 0);
  TimeOfDay _end = const TimeOfDay(hour: 13, minute: 0);
  int _slot = 30;
  late String _mode = widget.state.enabledModes.first;
  late String? _clinicId = widget.state.activeClinics.firstOrNull?.id;
  bool _saving = false;

  String _hhmm(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pick(bool start) async {
    final picked = await showTimePicker(context: context, initialTime: start ? _start : _end);
    if (picked != null) setState(() => start ? _start = picked : _end = picked);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final ok = await ref.read(availabilityControllerProvider.notifier).add(
          dayOfWeek: _day,
          startTime: _hhmm(_start),
          endTime: _hhmm(_end),
          slotMinutes: _slot,
          mode: _mode,
          clinicId: _mode == 'CLINIC' ? _clinicId : null,
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final clinics = widget.state.activeClinics;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add availability window', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          DropdownButtonFormField<int>(
            initialValue: _day,
            decoration: const InputDecoration(labelText: 'Day'),
            items: [for (var i = 0; i < 7; i++) DropdownMenuItem(value: i, child: Text(weekdayNames[i]))],
            onChanged: (v) => setState(() => _day = v ?? _day),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: OutlinedButton(onPressed: () => _pick(true), child: Text('Start ${_hhmm(_start)}'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton(onPressed: () => _pick(false), child: Text('End ${_hhmm(_end)}'))),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: _slot,
            decoration: const InputDecoration(labelText: 'Slot length'),
            items: [for (final m in const [15, 20, 30, 45, 60]) DropdownMenuItem(value: m, child: Text('$m minutes'))],
            onChanged: (v) => setState(() => _slot = v ?? _slot),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: [
              for (final m in widget.state.enabledModes) ButtonSegment(value: m, label: Text(m == 'VIDEO' ? 'Video' : 'Clinic')),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() => _mode = s.first),
          ),
          if (_mode == 'CLINIC') ...[
            const SizedBox(height: 12),
            if (clinics.isEmpty)
              const Text('Add a clinic on the partner portal first — a clinic-mode window needs a clinic.')
            else
              DropdownButtonFormField<String>(
                initialValue: _clinicId,
                decoration: const InputDecoration(labelText: 'Clinic'),
                items: [for (final c in clinics) DropdownMenuItem(value: c.id, child: Text('${c.name}, ${c.city}'))],
                onChanged: (v) => setState(() => _clinicId = v),
              ),
          ],
          const SizedBox(height: 16),
          FilledButton(onPressed: _saving ? null : _save, child: const Text('Add')),
        ],
      ),
    );
  }
}
