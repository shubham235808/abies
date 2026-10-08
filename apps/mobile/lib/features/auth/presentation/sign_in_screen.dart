import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'pending_redirect.dart';

/// `POST /api/v1/auth/otp/request` with either a mobile number or an email —
/// never both, matching the backend's own `.refine()` on the request schema.
///
/// Note (docs/mobile/API-GAP-ANALYSIS.md §3): OTP delivery by mobile-only
/// sign-up has no live channel yet — WhatsApp is wired but switched off, and
/// nothing goes to a phone number with no email on file until it's turned
/// on. Build and test against this screen now; don't expect a real OTP on a
/// phone-only new sign-up until that's live.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _mobileController = TextEditingController();
  final _emailController = TextEditingController();
  bool _useEmail = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _mobileController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(authApiProvider).requestOtp(
            mobile: _useEmail ? null : _mobileController.text.trim(),
            email: _useEmail ? _emailController.text.trim() : null,
          );
      if (!mounted) return;
      context.push('/otp', extra: {
        'requestId': result.requestId,
        'isNewAccount': result.isNewAccount,
        'devOtp': result.devOtp,
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Set by the router's redirect (an unauthenticated visit to a protected
    // route) or by a screen's own "this one action needs auth" check (e.g.
    // `/pharmacy/cart`'s "Checkout", `/panchakarma/book`'s "Confirm
    // booking") — null just means "signed in from here will go home",
    // which is still the normal, unprompted way to reach this screen.
    final hasPendingAction = ref.watch(pendingRedirectProvider) != null;
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Welcome to ABIES Ayurveda', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  hasPendingAction
                      ? "Sign in to continue — we'll take you right back to what you were doing."
                      : "We'll send you a one-time code to sign in.",
                ),
                const SizedBox(height: 24),
                if (!_useEmail)
                  TextFormField(
                    key: const ValueKey('mobile-field'),
                    controller: _mobileController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Mobile number', hintText: '98765 43210'),
                    validator: (v) => (v == null || v.trim().length < 10) ? 'Enter a valid mobile number' : null,
                  )
                else
                  TextFormField(
                    key: const ValueKey('email-field'),
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Email address'),
                    validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email address' : null,
                  ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _useEmail = !_useEmail),
                    child: Text(_useEmail ? 'Use mobile number instead' : 'Use email instead'),
                  ),
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
                      : const Text('Send OTP'),
                ),
                const SizedBox(height: 8),
                Center(
                  child: TextButton(
                    onPressed: () => context.push('/connection-diagnostics'),
                    child: const Text('Having trouble connecting?'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
