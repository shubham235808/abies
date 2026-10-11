import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/doctor_profile.dart';
import '../domain/profile_inputs.dart';
import 'clinics_controller.dart';
import 'profile_screen.dart';

/// Clinic locations — port of apps/partner-web/.../doctor/clinics, plus
/// edit and active/inactive (both supported by `PATCH
/// /doctors/me/clinics/[id]`).
class ClinicsScreen extends ConsumerWidget {
  const ClinicsScreen({super.key});

  Future<void> _openForm(BuildContext context, {DoctorClinic? clinic}) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => _ClinicSheet(clinic: clinic),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(clinicsControllerProvider);
    listenForProfileWorkMessages(context, ref, clinicsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Clinics')),
      floatingActionButton: async.valueOrNull == null
          ? null
          : FloatingActionButton.extended(
              icon: const Icon(Icons.add),
              label: const Text('Add clinic'),
              onPressed: async.value!.busy ? null : () => _openForm(context),
            ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: e is ApiException ? e.message : 'Could not load your clinics.',
          onRetry: () => ref.invalidate(clinicsControllerProvider),
        ),
        data: (state) => Stack(
          children: [
            if (state.profile.clinics.isEmpty)
              const EmptyStateView(
                message: 'No clinics added yet. Add one to offer in-person (clinic-mode) consultations.',
                icon: Icons.local_hospital_outlined,
              )
            else
              ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                children: [
                  for (final c in state.profile.clinics)
                    _ClinicTile(clinic: c, busy: state.busy, onEdit: () => _openForm(context, clinic: c)),
                ],
              ),
            if (state.busy) const Positioned(top: 0, left: 0, right: 0, child: LinearProgressIndicator()),
          ],
        ),
      ),
    );
  }
}

class _ClinicTile extends ConsumerWidget {
  const _ClinicTile({required this.clinic, required this.busy, required this.onEdit});

  final DoctorClinic clinic;
  final bool busy;
  final VoidCallback onEdit;

  Future<void> _remove(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove this clinic?'),
        // DoctorAvailability/AppointmentSlot/Appointment.clinic are all
        // `onDelete: SetNull` in schema.prisma — deleting doesn't fail, it
        // silently detaches them, so say so.
        content: const Text(
          'Availability windows and appointments linked to this clinic will lose their location. '
          'To stop offering it without affecting existing bookings, mark it inactive instead.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove')),
        ],
      ),
    );
    if (ok == true) await ref.read(clinicsControllerProvider.notifier).remove(clinic.id);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(clinicsControllerProvider.notifier);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(clinic.name, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(clinic.addressSummary),
            if (clinic.phone != null) Text(clinic.phone!, style: Theme.of(context).textTheme.bodySmall),
            Row(
              children: [
                Text(clinic.active ? 'Active' : 'Inactive', style: Theme.of(context).textTheme.bodySmall),
                Switch(value: clinic.active, onChanged: busy ? null : (v) => notifier.setActive(clinic.id, v)),
                const Spacer(),
                IconButton(tooltip: 'Edit', icon: const Icon(Icons.edit_outlined), onPressed: busy ? null : onEdit),
                IconButton(tooltip: 'Remove', icon: const Icon(Icons.delete_outline), onPressed: busy ? null : () => _remove(context, ref)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ClinicSheet extends ConsumerStatefulWidget {
  const _ClinicSheet({this.clinic});

  final DoctorClinic? clinic;

  @override
  ConsumerState<_ClinicSheet> createState() => _ClinicSheetState();
}

class _ClinicSheetState extends ConsumerState<_ClinicSheet> {
  late final ClinicInput _seed = widget.clinic == null
      ? const ClinicInput(name: '', addressLine1: '', city: '', state: '', postalCode: '')
      : ClinicInput.fromClinic(widget.clinic!);
  late final _name = TextEditingController(text: _seed.name);
  late final _line1 = TextEditingController(text: _seed.addressLine1);
  late final _line2 = TextEditingController(text: _seed.addressLine2);
  late final _city = TextEditingController(text: _seed.city);
  late final _state = TextEditingController(text: _seed.state);
  late final _postal = TextEditingController(text: _seed.postalCode);
  late final _phone = TextEditingController(text: _seed.phone);
  Map<String, String> _errors = const {};
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_name, _line1, _line2, _city, _state, _postal, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final input = ClinicInput(
      name: _name.text,
      addressLine1: _line1.text,
      addressLine2: _line2.text,
      city: _city.text,
      state: _state.text,
      postalCode: _postal.text,
      phone: _phone.text,
      active: _seed.active,
    );
    final errors = input.validate();
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    setState(() => _saving = true);
    final notifier = ref.read(clinicsControllerProvider.notifier);
    final ok = widget.clinic == null ? await notifier.add(input) : await notifier.edit(widget.clinic!.id, input);
    if (!mounted) return;
    setState(() {
      _saving = false;
      _errors = ref.read(clinicsControllerProvider).valueOrNull?.fieldErrors ?? const {};
    });
    if (ok) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    Widget field(TextEditingController c, String key, String label, {TextInputType? keyboard}) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
            controller: c,
            enabled: !_saving,
            keyboardType: keyboard,
            decoration: InputDecoration(labelText: label, errorText: _errors[key]),
          ),
        );
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.clinic == null ? 'Add clinic' : 'Edit clinic', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            field(_name, 'name', 'Clinic name'),
            field(_line1, 'addressLine1', 'Address'),
            field(_line2, 'addressLine2', 'Address line 2 (optional)'),
            field(_city, 'city', 'City'),
            field(_state, 'state', 'State'),
            field(_postal, 'postalCode', 'Postal code', keyboard: TextInputType.number),
            field(_phone, 'phone', 'Phone (optional)', keyboard: TextInputType.phone),
            const SizedBox(height: 4),
            FilledButton(onPressed: _saving ? null : _save, child: Text(widget.clinic == null ? 'Add clinic' : 'Save changes')),
          ],
        ),
      ),
    );
  }
}
