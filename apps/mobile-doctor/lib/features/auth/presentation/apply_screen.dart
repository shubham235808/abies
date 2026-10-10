import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/form_bits.dart';
import 'doctor_apply_controller.dart';

/// "Apply as a doctor" — the OTP self-onboarding path, ported from the web
/// partner portal's apply page (apps/partner-web/src/app/partner/login/
/// apply/page.tsx → design-system `LoginFlow`), fixed to the DOCTOR role.
/// Verifying the code creates the DOCTOR account when the server allows
/// self-onboarding (`ALLOW_DOCTOR_SELF_ONBOARDING`); the new account starts
/// with a DRAFT profile that the dashboard then explains.
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
    await ref.read(doctorApplyControllerProvider.notifier).requestCode(_identifierController.text);
    final devOtp = ref.read(doctorApplyControllerProvider).devOtp;
    if (devOtp != null) _otpController.text = devOtp;
  }

  Future<void> _verify() async {
    if (!(_otpFormKey.currentState?.validate() ?? false)) return;
    final ok = await ref.read(doctorApplyControllerProvider.notifier).verify(
          otp: _otpController.text,
          acceptedTerms: _acceptedTerms,
          name: _nameController.text,
        );
    if (ok && mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(doctorApplyControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Apply as a doctor')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: state.step == ApplyStep.identifier ? _identifierStep(state) : _otpStep(state),
        ),
      ),
    );
  }

  Widget _identifierStep(DoctorApplyState state) {
    return Form(
      key: _identifierFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text("New here? We'll send a one-time code to get started. "
              'After you verify, complete your profile and documents for the ABIES verification team.'),
          const SizedBox(height: 24),
          TextFormField(
            controller: _identifierController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Mobile number or email', hintText: '98765 43210 or you@example.com'),
            validator: validateIdentifier,
          ),
          FormErrorText(state.error),
          const SizedBox(height: 16),
          BusyFilledButton(busy: state.submitting, onPressed: _requestCode, label: 'Send code'),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: () => context.pop(),
              child: const Text('Already approved? Sign in with your password'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _otpStep(DoctorApplyState state) {
    return Form(
      key: _otpFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (state.devOtp != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text('Development mode — your code is ${state.devOtp}.'),
              ),
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
            validator: validateOtp,
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _acceptedTerms,
            onChanged: (v) => setState(() => _acceptedTerms = v ?? false),
            title: const Text('I accept the ABIES Terms and Privacy Notice (abies.in/terms, abies.in/privacy).'),
          ),
          FormErrorText(state.error),
          const SizedBox(height: 16),
          Row(
            children: [
              OutlinedButton(
                onPressed: state.submitting ? null : () => ref.read(doctorApplyControllerProvider.notifier).back(),
                child: const Text('Back'),
              ),
              const SizedBox(width: 12),
              Expanded(child: BusyFilledButton(busy: state.submitting, onPressed: _verify, label: 'Verify & continue')),
            ],
          ),
        ],
      ),
    );
  }
}
