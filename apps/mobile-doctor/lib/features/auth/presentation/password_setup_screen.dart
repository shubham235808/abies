import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/form_bits.dart';
import 'auth_controller.dart';
import 'sign_in_controller.dart';

/// Forced first-time password setup for an account with no password yet
/// (`POST /auth/login` returned `requiresPasswordSetup: true`, and
/// [SignInController] already called `POST /auth/password/forgot` to get
/// [requestId]). `POST /auth/password/setup` verifies the code and signs the
/// caller straight in — no separate "now log in" step.
class PasswordSetupScreen extends ConsumerStatefulWidget {
  const PasswordSetupScreen({super.key, required this.requestId, required this.mobile});

  final String requestId;
  final String mobile;

  @override
  ConsumerState<PasswordSetupScreen> createState() => _PasswordSetupScreenState();
}

class _PasswordSetupScreenState extends ConsumerState<PasswordSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _otpController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(authApiProvider).completePasswordSetup(
            requestId: widget.requestId,
            otp: _otpController.text.trim(),
            newPassword: _passwordController.text,
          );
      final outcome = await ref.read(signInControllerProvider).completeVerified(result.user);
      if (!mounted) return;
      if (outcome is SignInFailed) {
        setState(() => _error = outcome.message);
      } else {
        context.go('/');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Set up your password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text("Your account doesn't have a password yet. Enter the code we sent to ${widget.mobile} and choose one."),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  decoration: const InputDecoration(labelText: 'One-time code'),
                  validator: validateOtp,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: const InputDecoration(labelText: 'New password', helperText: 'At least 12 characters'),
                  validator: validateNewPassword,
                ),
                FormErrorText(_error),
                const SizedBox(height: 16),
                BusyFilledButton(busy: _submitting, onPressed: _submit, label: 'Set password'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
