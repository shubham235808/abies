import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'complete_sign_in.dart';
import 'forgot_password_screen.dart' show validateNewPassword, validateOtp;

/// Forced first-time password setup for an account that has never set a
/// password (`POST /auth/login` returned `requiresPasswordSetup: true`;
/// [SignInScreen] already called `POST /auth/password/forgot` for
/// [requestId]). `POST /auth/password/setup` signs straight into a fresh
/// session. Not self-onboarding — the account already exists.
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
      await ref.read(authApiProvider).completePasswordSetup(
            requestId: widget.requestId,
            otp: _otpController.text.trim(),
            newPassword: _passwordController.text,
          );
      if (!mounted) return;
      final error = await completeSignIn(ref, context);
      if (error != null && mounted) setState(() => _error = error);
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
                  decoration: const InputDecoration(labelText: 'New password', helperText: 'At least 12 characters'),
                  validator: validateNewPassword,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Set password'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
