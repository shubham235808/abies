import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'complete_sign_in.dart';
import 'sign_in_screen.dart' show validateIdentifier;

/// Voluntary forgot-password, two steps in one screen (same as apps/mobile
/// and the web `forgot-request` → `forgot-otp` steps): identifier →
/// `POST /auth/password/forgot`, then code + new password →
/// `POST /auth/password/reset`, which signs the caller into a fresh session.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _requestFormKey = GlobalKey<FormState>();
  final _resetFormKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  String? _requestId;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
    _otpController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submitRequest() async {
    if (!(_requestFormKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final identifier = _identifierController.text.trim();
      final isEmail = identifier.contains('@');
      final result = await ref.read(authApiProvider).requestPasswordReset(
            mobile: isEmail ? null : identifier,
            email: isEmail ? identifier : null,
          );
      if (!mounted) return;
      setState(() => _requestId = result.requestId);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _submitReset() async {
    if (!(_resetFormKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authApiProvider).resetPassword(
            requestId: _requestId!,
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
      appBar: AppBar(title: const Text('Reset your password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: _requestId != null ? _buildResetStep(context) : _buildRequestStep(context),
        ),
      ),
    );
  }

  Widget _buildRequestStep(BuildContext context) {
    return Form(
      key: _requestFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text("We'll send a one-time code to confirm it's you."),
          const SizedBox(height: 24),
          TextFormField(
            controller: _identifierController,
            decoration: const InputDecoration(labelText: 'Mobile number or email', hintText: '98765 43210 or you@example.com'),
            validator: validateIdentifier,
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _submitting ? null : _submitRequest,
            child: _submitting
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Send code'),
          ),
        ],
      ),
    );
  }

  Widget _buildResetStep(BuildContext context) {
    return Form(
      key: _resetFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('If an account exists, a code was sent to it. Enter it below with your new password.'),
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
            onPressed: _submitting ? null : _submitReset,
            child: _submitting
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Reset password'),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: _submitting ? null : () => setState(() => _requestId = null),
              child: const Text('Back'),
            ),
          ),
        ],
      ),
    );
  }
}

/// `otp: z.string().min(4).max(8)` in auth.schemas.ts.
String? validateOtp(String? v) {
  final value = v?.trim() ?? '';
  if (value.length < 4) return 'Enter the code you received';
  if (value.length > 8) return 'That code is too long';
  return null;
}

/// `newPasswordField`: min 12, max 256, no complexity rules (auth.schemas.ts).
String? validateNewPassword(String? v) {
  if (v == null || v.length < 12) return 'Password must be at least 12 characters';
  if (v.length > 256) return 'Password is too long';
  return null;
}
