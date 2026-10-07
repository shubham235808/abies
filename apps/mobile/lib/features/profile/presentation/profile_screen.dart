import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/consent.dart';
import '../domain/family_member.dart';
import 'profile_controller.dart';

/// Reads/edits `PatientProfile`, family members and consent in one screen
/// for Phase 2 (docs/mobile/IMPLEMENTATION-PLAN.md) — splitting this into
/// separate tabs/screens is a presentation-layer refinement for later, not
/// a change to which backend calls are made.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My profile')),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your profile.',
          onRetry: () => ref.invalidate(profileControllerProvider),
        ),
        data: (data) => _ProfileBody(data: data),
      ),
    );
  }
}

class _ProfileBody extends ConsumerStatefulWidget {
  const _ProfileBody({required this.data});

  final ProfileData data;

  @override
  ConsumerState<_ProfileBody> createState() => _ProfileBodyState();
}

class _ProfileBodyState extends ConsumerState<_ProfileBody> {
  late final _firstName = TextEditingController(text: widget.data.profile.firstName);
  late final _lastName = TextEditingController(text: widget.data.profile.lastName);
  late final _city = TextEditingController(text: widget.data.profile.city);
  late final _pin = TextEditingController(text: widget.data.profile.pin);
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _city.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(profileControllerProvider.notifier).updateProfile({
        'firstName': _firstName.text.trim(),
        'lastName': _lastName.text.trim(),
        'city': _city.text.trim(),
        'pin': _pin.text.trim(),
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _addFamilyMember() async {
    final nameController = TextEditingController();
    String relation = familyRelations.first;
    final added = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add family member'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Name')),
              const SizedBox(height: 12),
              DropdownButton<String>(
                value: relation,
                items: familyRelations.map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                onChanged: (v) => setDialogState(() => relation = v ?? relation),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Add')),
          ],
        ),
      ),
    );
    if (added != true || nameController.text.trim().isEmpty) return;
    await ref.read(profileControllerProvider.notifier).addFamilyMember({'name': nameController.text.trim(), 'relation': relation});
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(data.mobile, style: Theme.of(context).textTheme.bodyMedium),
        if (data.email != null) Text(data.email!, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 24),
        TextField(controller: _firstName, decoration: const InputDecoration(labelText: 'First name')),
        const SizedBox(height: 12),
        TextField(controller: _lastName, decoration: const InputDecoration(labelText: 'Last name')),
        const SizedBox(height: 12),
        TextField(controller: _city, decoration: const InputDecoration(labelText: 'City')),
        const SizedBox(height: 12),
        TextField(controller: _pin, decoration: const InputDecoration(labelText: 'PIN code')),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 16),
        FilledButton(onPressed: _saving ? null : _save, child: _saving ? const Text('Saving…') : const Text('Save')),
        const Divider(height: 48),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Family members', style: Theme.of(context).textTheme.titleMedium),
            IconButton(onPressed: _addFamilyMember, icon: const Icon(Icons.add)),
          ],
        ),
        if (data.profile.familyMembers.isEmpty)
          const EmptyStateView(message: 'No family members added yet.', icon: Icons.people_outline)
        else
          for (final FamilyMember member in data.profile.familyMembers)
            ListTile(
              title: Text(member.name),
              subtitle: Text(member.relation),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () => ref.read(profileControllerProvider.notifier).deleteFamilyMember(member.id),
              ),
            ),
        const Divider(height: 48),
        Text('Consent', style: Theme.of(context).textTheme.titleMedium),
        for (final ConsentRecord record in data.consents)
          ListTile(
            title: Text(record.artifactTitle ?? record.artifactId),
            subtitle: Text(record.isActive ? 'Accepted' : 'Withdrawn'),
            trailing: record.isActive
                ? TextButton(
                    onPressed: () => ref.read(profileControllerProvider.notifier).withdrawConsent(record.artifactId),
                    child: const Text('Withdraw'),
                  )
                : null,
          ),
      ],
    );
  }
}
