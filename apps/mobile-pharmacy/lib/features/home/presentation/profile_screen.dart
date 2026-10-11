import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/pharmacy_profile.dart';
import 'home_controller.dart';

/// Pharmacy profile + submit-for-verification — the app port of
/// apps/partner-web/src/app/partner/pharmacy/profile/ and its
/// submit-button.tsx. Editable only while DRAFT/REJECTED; read-only
/// otherwise (the backend locks it too).
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(pharmacyProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Pharmacy profile')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException && e.isTransportFailure
            ? OfflineStateView(onRetry: () => ref.invalidate(pharmacyProfileProvider))
            : ErrorStateView(
                message: e is ApiException ? e.message : 'Could not load your profile.',
                onRetry: () => ref.invalidate(pharmacyProfileProvider),
              ),
        data: (profile) => profile.isEditable ? _EditableProfile(profile: profile) : _ReadOnlyProfile(profile: profile),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.profile});

  final PharmacyProfile profile;

  @override
  Widget build(BuildContext context) {
    final semantic = Theme.of(context).extension<AppSemanticColors>()!;
    final (Color bg, Color fg, String label, String body) = switch (profile.verificationStatus) {
      'APPROVED' => (semantic.successSubtle, semantic.successStrong, 'Approved', 'Your pharmacy is verified and can receive orders.'),
      'SUBMITTED' || 'UNDER_REVIEW' => (
          semantic.infoSubtle,
          semantic.infoStrong,
          'Under review',
          "Your application is with the ABIES verification team. You'll be notified once it's reviewed."
        ),
      'REJECTED' => (
          semantic.dangerSubtle,
          semantic.dangerStrong,
          'Rejected',
          'Your last application was rejected${profile.rejectionReason != null ? ': ${profile.rejectionReason}' : '.'} Update your details below and resubmit.'
        ),
      'SUSPENDED' => (
          semantic.dangerSubtle,
          semantic.dangerStrong,
          'Suspended',
          'Your account has been suspended${profile.rejectionReason != null ? ': ${profile.rejectionReason}' : '.'} Contact ABIES support.'
        ),
      _ => (
          semantic.warningSubtle,
          semantic.warningStrong,
          'Draft',
          'This information is reviewed by ABIES before your pharmacy can accept orders. Save your details, then submit for verification.'
        ),
    };
    return Card(
      color: bg,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(body, style: TextStyle(color: fg)),
          ],
        ),
      ),
    );
  }
}

class _ReadOnlyProfile extends StatelessWidget {
  const _ReadOnlyProfile({required this.profile});

  final PharmacyProfile profile;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget field(String label, String value) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [Text(label, style: text.labelLarge), const SizedBox(height: 2), Text(value.isEmpty ? '—' : value)],
          ),
        );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _StatusCard(profile: profile),
        field('Pharmacy name', profile.name ?? ''),
        field('License numbers', profile.licenseNumbers.join(', ')),
        field('Service areas', profile.serviceAreas.join(', ')),
        Text(
          'Details are locked while verification is in progress or approved. Contact ABIES support for regulated changes.',
          style: text.bodySmall,
        ),
      ],
    );
  }
}

class _EditableProfile extends ConsumerStatefulWidget {
  const _EditableProfile({required this.profile});

  final PharmacyProfile profile;

  @override
  ConsumerState<_EditableProfile> createState() => _EditableProfileState();
}

class _EditableProfileState extends ConsumerState<_EditableProfile> {
  late final _name = TextEditingController(text: widget.profile.name ?? '');
  late final _licenses = TextEditingController(text: widget.profile.licenseNumbers.join('\n'));
  late final _areas = TextEditingController(text: widget.profile.serviceAreas.join('\n'));
  bool _declaration = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _licenses.dispose();
    _areas.dispose();
    super.dispose();
  }

  bool get _dirty {
    final p = ref.read(pharmacyProfileProvider).valueOrNull ?? widget.profile;
    return _name.text.trim() != (p.name ?? '') ||
        splitLines(_licenses.text).join('\n') != p.licenseNumbers.join('\n') ||
        splitLines(_areas.text).join('\n') != p.serviceAreas.join('\n');
  }

  Future<String?> _saveNow() => ref.read(pharmacyProfileProvider.notifier).save(
        name: _name.text,
        licenseNumbers: splitLines(_licenses.text),
        serviceAreas: splitLines(_areas.text),
      );

  Future<void> _run(Future<String?> Function() action, String successMessage) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await action();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
  }

  Future<void> _save() => _run(_saveNow, 'Profile saved');

  /// Saves unsaved edits first, so what gets submitted is what's on screen.
  Future<void> _submit() => _run(() async {
        if (_dirty) {
          final saveError = await _saveNow();
          if (saveError != null) return saveError;
        }
        return ref.read(pharmacyProfileProvider.notifier).submit(declarationAccepted: _declaration);
      }, 'Application submitted for verification');

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _StatusCard(profile: widget.profile),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        TextField(
          key: const ValueKey('profile-name'),
          controller: _name,
          maxLength: profileNameMax,
          decoration: const InputDecoration(labelText: 'Pharmacy name'),
        ),
        const SizedBox(height: 8),
        TextField(
          key: const ValueKey('profile-licenses'),
          controller: _licenses,
          minLines: 2,
          maxLines: 5,
          decoration: const InputDecoration(labelText: 'License numbers', helperText: 'One per line (e.g. drug licence, retail licence)'),
        ),
        const SizedBox(height: 16),
        TextField(
          key: const ValueKey('profile-areas'),
          controller: _areas,
          minLines: 2,
          maxLines: 6,
          decoration: const InputDecoration(labelText: 'Service areas', helperText: 'One per line — cities or localities you deliver to'),
        ),
        const SizedBox(height: 16),
        OutlinedButton(onPressed: _busy ? null : _save, child: const Text('Save profile')),
        const SizedBox(height: 24),
        Text('Submit for verification', style: text.titleMedium),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _declaration,
          onChanged: _busy ? null : (v) => setState(() => _declaration = v ?? false),
          title: const Text(
            'I declare that the information provided is accurate and that this pharmacy is licensed to operate under the stated registrations.',
          ),
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _busy || !_declaration ? null : _submit,
          child: _busy
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Submit application'),
        ),
      ],
    );
  }
}
