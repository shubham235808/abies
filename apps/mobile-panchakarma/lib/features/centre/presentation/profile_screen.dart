import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/loading_skeleton.dart';
import '../domain/centre_models.dart';
import 'dashboard_controller.dart';
import 'widgets.dart';

/// Centre profile + verification submit — the mobile counterpart of
/// apps/partner-web/.../profile/profile-form.tsx and the overview page's
/// SubmitButton. Editable only while DRAFT/REJECTED (centres.service.ts
/// `editableStatus`); read-only otherwise. Without this, a centre that just
/// applied via OTP would have no way to reach APPROVED from the app.
class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardControllerProvider);
    return async.when(
      loading: () => const Padding(padding: EdgeInsets.all(16), child: LoadingSkeleton(height: 200)),
      error: (e, _) => errorView(e, () => ref.invalidate(dashboardControllerProvider)),
      data: (dash) => dash.centre.isEditable
          ? _EditableProfile(key: ValueKey(dash.centre.id), centre: dash.centre)
          : _ReadOnlyProfile(centre: dash.centre),
    );
  }
}

class _ReadOnlyProfile extends StatelessWidget {
  const _ReadOnlyProfile({required this.centre});

  final CentreProfile centre;

  @override
  Widget build(BuildContext context) {
    Widget row(String label, String? value) => ListTile(title: Text(label), subtitle: Text(value == null || value.isEmpty ? '—' : value));
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [
        row('Centre name', centre.name),
        row('Address', [centre.addressLine1, centre.city, centre.state, centre.postalCode].whereType<String>().join(', ')),
        row('Supervising practitioner', centre.supervisingPractitioner),
        row('License numbers', centre.licenseNumbers.join(', ')),
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text('Centre details are locked while verification is in progress or approved. Contact ABIES support for regulated changes.'),
        ),
      ],
    );
  }
}

class _EditableProfile extends ConsumerStatefulWidget {
  const _EditableProfile({super.key, required this.centre});

  final CentreProfile centre;

  @override
  ConsumerState<_EditableProfile> createState() => _EditableProfileState();
}

class _EditableProfileState extends ConsumerState<_EditableProfile> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.centre.name);
  late final _address = TextEditingController(text: widget.centre.addressLine1);
  late final _city = TextEditingController(text: widget.centre.city);
  late final _state = TextEditingController(text: widget.centre.state);
  late final _postal = TextEditingController(text: widget.centre.postalCode);
  late final _practitioner = TextEditingController(text: widget.centre.supervisingPractitioner);
  late final _licenses = TextEditingController(text: widget.centre.licenseNumbers.join(', '));
  bool _declaration = false;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _address, _city, _state, _postal, _practitioner, _licenses]) {
      c.dispose();
    }
    super.dispose();
  }

  CentreProfileInput get _input => CentreProfileInput(
        name: _name.text,
        addressLine1: _address.text,
        city: _city.text,
        state: _state.text,
        postalCode: _postal.text,
        supervisingPractitioner: _practitioner.text,
        licenseNumbers: _licenses.text.split(','),
      );

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final error = await ref.read(dashboardControllerProvider.notifier).updateProfile(_input);
    if (!mounted) return;
    setState(() => _busy = false);
    showMessage(context, error ?? 'Profile saved', isError: error != null);
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final controller = ref.read(dashboardControllerProvider.notifier);
    // Save first so the submission is checked against what's on screen.
    final error = await controller.updateProfile(_input) ?? await controller.submitApplication();
    if (!mounted) return;
    setState(() => _busy = false);
    showMessage(context, error ?? 'Application submitted for verification', isError: error != null);
  }

  @override
  Widget build(BuildContext context) {
    String? maxLen(String? v, int max) => (v != null && v.trim().length > max) ? 'Must be $max characters or fewer' : null;
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (widget.centre.verificationStatus == CentreVerificationStatus.rejected && widget.centre.rejectionReason != null)
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text('Rejected: ${widget.centre.rejectionReason}. Update your details and resubmit.'),
              ),
            ),
          // Bounds from updateCentreProfileSchema (centres.schemas.ts).
          TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Centre name'), validator: (v) => maxLen(v, 200)),
          const SizedBox(height: 12),
          TextFormField(controller: _address, decoration: const InputDecoration(labelText: 'Address'), validator: (v) => maxLen(v, 300)),
          const SizedBox(height: 12),
          TextFormField(controller: _city, decoration: const InputDecoration(labelText: 'City'), validator: (v) => maxLen(v, 100)),
          const SizedBox(height: 12),
          TextFormField(controller: _state, decoration: const InputDecoration(labelText: 'State'), validator: (v) => maxLen(v, 100)),
          const SizedBox(height: 12),
          TextFormField(
            controller: _postal,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Postal code'),
            validator: (v) => maxLen(v, 20),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _practitioner,
            decoration: const InputDecoration(labelText: 'Supervising practitioner'),
            validator: (v) => maxLen(v, 200),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _licenses,
            decoration: const InputDecoration(labelText: 'License numbers', helperText: 'Comma-separated, up to 20'),
            validator: (v) {
              final items = (v ?? '').split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
              if (items.length > 20) return 'At most 20 license numbers';
              if (items.any((s) => s.length > 100)) return 'Each license number must be 100 characters or fewer';
              return null;
            },
          ),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: _busy ? null : _save, child: const Text('Save draft')),
          const Divider(height: 32),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _declaration,
            onChanged: (v) => setState(() => _declaration = v ?? false),
            title: const Text('I declare that the details above are accurate and that this centre holds the licenses listed.'),
          ),
          FilledButton(
            onPressed: (_busy || !_declaration) ? null : _submit,
            child: const Text('Submit for verification'),
          ),
        ],
      ),
    );
  }
}
