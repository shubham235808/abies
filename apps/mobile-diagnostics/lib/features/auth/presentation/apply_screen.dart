import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'apply_controller.dart';
import 'complete_sign_in.dart';
import 'sign_in_screen.dart' show validateIdentifier;

/// "Apply as a lab partner" — the OTP create-account-on-verify path. See
/// [ApplyController] for the exact server contract.
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
    // Same convenience as the web form: a dev-mode code is pre-filled.
    if (devOtp != null) _otpController.text = devOtp;
  }

  Future<void> _verify() async {
    if (!(_otpFormKey.currentState?.validate() ?? false)) return;
    final controller = ref.read(applyControllerProvider.notifier);
    final user = await controller.verify(
      otp: _otpController.text,
      acceptedTerms: _acceptedTerms,
      name: _nameController.text,
    );
    if (user == null || !mounted) return;
    final error = await completeSignIn(ref, context, user);
    if (error != null) controller.reportError(error);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(applyControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Apply as a lab partner')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Image.asset('assets/images/abies-mark.png', width: 56, height: 56, excludeFromSemantics: true),
              ),
              const SizedBox(height: 16),
              Text('New here?', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text(
                "We'll send a one-time code to get your diagnostic lab started. "
                'After verifying, complete your lab profile and submit it for ABIES verification.',
              ),
              const SizedBox(height: 24),
              if (state.step == ApplyStep.identifier) _buildIdentifierStep(state) else _buildOtpStep(state),
              if (state.error != null) ...[
                const SizedBox(height: 12),
                Text(state.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 16),
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

  Widget _buildIdentifierStep(ApplyState state) {
    return Form(
      key: _identifierFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            key: const ValueKey('apply-identifier-field'),
            controller: _identifierController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Mobile number or email', hintText: '98765 43210 or lab@example.com'),
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

  Widget _buildOtpStep(ApplyState state) {
    final scheme = Theme.of(context).colorScheme;
    return Form(
      key: _otpFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (state.devOtp != null)
            Card(
              color: scheme.tertiaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text('Development mode — your code is ${state.devOtp}.', style: TextStyle(color: scheme.onTertiaryContainer)),
              ),
            ),
          if (state.isNewAccount) ...[
            const SizedBox(height: 8),
            TextFormField(
              key: const ValueKey('apply-name-field'),
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Your full name', hintText: 'As on your ID'),
              validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your full name' : null,
            ),
          ],
          const SizedBox(height: 16),
          TextFormField(
            key: const ValueKey('apply-otp-field'),
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
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _acceptedTerms,
            onChanged: (v) => setState(() => _acceptedTerms = v ?? false),
            title: const Text('I accept the ABIES Terms and Privacy Notice (abies.in/terms, abies.in/privacy).'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: state.submitting ? null : _verify,
            child: state.submitting
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Verify & continue'),
          ),
          TextButton(
            onPressed: state.submitting
                ? null
                : () {
                    _otpController.clear();
                    ref.read(applyControllerProvider.notifier).backToIdentifier();
                  },
            child: const Text('Back'),
          ),
        ],
      ),
    );
  }
}
