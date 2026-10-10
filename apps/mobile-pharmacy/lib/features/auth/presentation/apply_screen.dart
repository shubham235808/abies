import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'apply_controller.dart';
import 'sign_in_screen.dart' show validateIdentifier;

/// Secondary entry point — "Apply as a pharmacy partner" via a one-time
/// code. All logic lives in [ApplyController]; this is presentation only.
class ApplyScreen extends ConsumerStatefulWidget {
  const ApplyScreen({super.key});

  @override
  ConsumerState<ApplyScreen> createState() => _ApplyScreenState();
}

class _ApplyScreenState extends ConsumerState<ApplyScreen> {
  final _identifierFormKey = GlobalKey<FormState>();
  final _otpFormKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _otpController = TextEditingController();
  final _nameController = TextEditingController();
  bool _acceptedTerms = false;

  @override
  void dispose() {
    _identifierController.dispose();
    _otpController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    if (!(_identifierFormKey.currentState?.validate() ?? false)) return;
    await ref.read(applyControllerProvider.notifier).requestCode(_identifierController.text);
    final devOtp = ref.read(applyControllerProvider).devOtp;
    if (devOtp != null) _otpController.text = devOtp;
  }

  Future<void> _verify() async {
    if (!(_otpFormKey.currentState?.validate() ?? false)) return;
    final ok = await ref.read(applyControllerProvider.notifier).verify(
          otp: _otpController.text,
          acceptedTerms: _acceptedTerms,
          name: _nameController.text,
        );
    if (ok && mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(applyControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Apply as a partner')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(child: Image.asset('assets/images/abies-mark.png', width: 56, height: 56, excludeFromSemantics: true)),
              const SizedBox(height: 16),
              Text('Pharmacy partner application', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              const Text("New here? We'll send a one-time code to get started."),
              const SizedBox(height: 24),
              if (state.step == ApplyStep.identifier) _identifierStep(state) else _otpStep(state),
              if (state.error != null) ...[
                const SizedBox(height: 12),
                Text(state.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 16),
              Center(
                child: TextButton(
                  onPressed: () => context.canPop() ? context.pop() : context.go('/sign-in'),
                  child: const Text('Already approved? Sign in with your password'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _identifierStep(ApplyState state) {
    return Form(
      key: _identifierFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            key: const ValueKey('apply-identifier-field'),
            controller: _identifierController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Mobile number or email', hintText: '98765 43210 or you@example.com'),
            validator: validateIdentifier,
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: state.submitting ? null : _requestCode,
            child: state.submitting
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Send code'),
          ),
        ],
      ),
    );
  }

  Widget _otpStep(ApplyState state) {
    final scheme = Theme.of(context).colorScheme;
    return Form(
      key: _otpFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (state.devOtp != null)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(color: scheme.tertiaryContainer, borderRadius: BorderRadius.circular(12)),
              child: Text('Development mode — your code is ${state.devOtp}.', style: TextStyle(color: scheme.onTertiaryContainer)),
            ),
          if (state.isNewAccount) ...[
            TextFormField(
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Your full name', hintText: 'As on your ID'),
              validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your full name' : null,
            ),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: _otpController,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            decoration: const InputDecoration(labelText: 'Enter the 6-digit code'),
            validator: (v) {
              final value = v?.trim() ?? '';
              return (value.length < 4 || value.length > 8) ? 'Enter the code you received' : null;
            },
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            value: _acceptedTerms,
            onChanged: (v) => setState(() => _acceptedTerms = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('I accept the ABIES Terms and Privacy Notice (abies.in/terms, abies.in/privacy).'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              OutlinedButton(
                onPressed: state.submitting ? null : () => ref.read(applyControllerProvider.notifier).back(),
                child: const Text('Back'),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: state.submitting ? null : _verify,
                  child: state.submitting
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Verify & continue'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
