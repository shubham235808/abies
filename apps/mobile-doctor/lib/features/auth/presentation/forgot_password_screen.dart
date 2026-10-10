import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/form_bits.dart';
import 'auth_controller.dart';
import 'sign_in_controller.dart';

/// Voluntary forgot-password flow, two steps in one screen: identifier ->
/// `POST /auth/password/forgot` (same generic response whether or not the
/// account exists), then otp + new password -> `POST /auth/password/reset`,
/// which signs the caller into a fresh session on success.
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
      final id = splitIdentifier(_identifierController.text);
      final result = await ref.read(authApiProvider).requestPasswordReset(mobile: id.mobile, email: id.email);
      if (mounted) setState(() => _requestId = result.requestId);
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
      final result = await ref.read(authApiProvider).resetPassword(
            requestId: _requestId!,
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
          FormErrorText(_error),
          const SizedBox(height: 16),
          BusyFilledButton(busy: _submitting, onPressed: _submitRequest, label: 'Send code'),
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
          FormErrorText(_error),
          const SizedBox(height: 16),
          BusyFilledButton(busy: _submitting, onPressed: _submitReset, label: 'Reset password'),
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
