import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'apply_controller.dart';
import 'sign_in_screen.dart' show validateIdentifier;

/// "Apply as a Panchakarma centre" — OTP onboarding, secondary to password
/// sign-in. See [ApplyController] for the backend contract.
class ApplyScreen extends ConsumerStatefulWidget {
  const ApplyScreen({super.key});

  @override
  ConsumerState<ApplyScreen> createState() => _ApplyScreenState();
}

class _ApplyScreenState extends ConsumerState<ApplyScreen> {
  final _identifierFormKey = GlobalKey<FormState>();
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
    // Dev-only convenience (EXPOSE_DEV_OTP): prefill the code the backend
    // returned, same as the web LoginFlow does. Never present in production.
    final devOtp = ref.read(applyControllerProvider).devOtp;
    if (devOtp != null) _otpController.text = devOtp;
  }

  Future<void> _verify() async {
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
      appBar: AppBar(title: const Text('Apply as a centre')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(child: Image.asset('assets/images/abies-mark.png', width: 56, height: 56, excludeFromSemantics: true)),
              const SizedBox(height: 16),
              if (state.step == ApplyStep.identifier) ..._identifierStep(context, state) else ..._otpStep(context, state),
              if (state.error != null) ...[
                const SizedBox(height: 12),
                Text(state.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 24),
              Center(
                child: TextButton(
                  onPressed: () => context.go('/sign-in'),
                  child: const Text('Already approved? Sign in with your password'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _identifierStep(BuildContext context, ApplyState state) {
    return [
      Text('New here? We’ll send a one-time code to get started.', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 24),
      Form(
        key: _identifierFormKey,
        child: TextFormField(
          controller: _identifierController,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Mobile number or email', hintText: '98765 43210 or you@example.com'),
          validator: validateIdentifier,
        ),
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: state.submitting ? null : _requestCode,
        child: state.submitting
            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : const Text('Send code'),
      ),
    ];
  }

  List<Widget> _otpStep(BuildContext context, ApplyState state) {
    return [
      Text(
        state.isNewAccount ? 'Enter the code we sent, and your name to create your centre account.' : 'Enter the code we sent to sign in.',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const SizedBox(height: 24),
      TextField(
        controller: _otpController,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'One-time code'),
      ),
      if (state.isNewAccount) ...[
        const SizedBox(height: 16),
        TextField(
          controller: _nameController,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Your full name'),
        ),
      ],
      const SizedBox(height: 8),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        value: _acceptedTerms,
        onChanged: (v) => setState(() => _acceptedTerms = v ?? false),
        title: const Text('I accept the ABIES Terms of Use and Privacy Notice'),
      ),
      const SizedBox(height: 8),
      FilledButton(
        onPressed: state.submitting ? null : _verify,
        child: state.submitting
            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : const Text('Verify and continue'),
      ),
      const SizedBox(height: 8),
      Center(
        child: TextButton(
          onPressed: state.submitting
              ? null
              : () {
                  _otpController.clear();
                  ref.read(applyControllerProvider.notifier).back();
                },
          child: const Text('Use a different number'),
        ),
      ),
    ];
  }
}
