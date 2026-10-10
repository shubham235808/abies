import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'complete_sign_in.dart';
import 'pending_redirect.dart';

/// `POST /api/v1/auth/login` with either a mobile number or an email — never
/// both, matching the backend's own `.refine()` on `loginSchema`.
/// Password-first (docs/password-auth-backend.md): a legacy OTP-only
/// account (`requiresPasswordSetup: true`) is routed to `/password-setup`
/// instead of failing, and "Create an account" / "Forgot password?" cover
/// the other two cases this screen used to need a second route for.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
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
      final identifier = _identifierController.text.trim();
      final isEmail = identifier.contains('@');
      final result = await ref.read(authApiProvider).login(
            mobile: isEmail ? null : identifier,
            email: isEmail ? identifier : null,
            password: _passwordController.text,
          );
      if (!mounted) return;
      if (result.requiresPasswordSetup) {
        // Prove control of the account's OTP channel first — same request
        // the forgot-password flow uses — then move to the setup screen.
        final reset = await ref.read(authApiProvider).requestPasswordReset(mobile: result.mobile);
        if (!mounted) return;
        if (!context.mounted) return;
        context.push('/password-setup', extra: {'requestId': reset.requestId, 'mobile': result.mobile});
        return;
      }
      if (result.mfaRequired) {
        // Admin MFA only — a PATIENT account should never reach this.
        setState(() => _error = 'This account requires additional verification not supported in this app.');
        return;
      }
      await completeSignIn(ref, context, result.user!);
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
    // booking") — null just means "signed in from here will go home", which
    // is still the normal, unprompted way to reach this screen.
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
                Center(
                  // Decorative — the "Welcome to ABIES Ayurveda" heading right
                  // below already says the same thing; a semantic label here
                  // would make a screen reader announce it twice.
                  child: Image.asset(
                    'assets/images/abies-mark.png',
                    width: 64,
                    height: 64,
                    excludeFromSemantics: true,
                  ),
                ),
                const SizedBox(height: 16),
                Text('Welcome to ABIES Ayurveda', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  hasPendingAction
                      ? "Sign in to continue — we'll take you right back to what you were doing."
                      : 'Sign in with your mobile number or email.',
                ),
                const SizedBox(height: 24),
                TextFormField(
                  key: const ValueKey('identifier-field'),
                  controller: _identifierController,
                  decoration: const InputDecoration(labelText: 'Mobile number or email', hintText: '98765 43210 or you@example.com'),
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.isEmpty) return 'Enter your mobile number or email';
                    if (value.contains('@')) return null;
                    return value.replaceAll(RegExp(r'\D'), '').length >= 10 ? null : 'Enter a 10-digit mobile number or a valid email';
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: const ValueKey('password-field'),
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password'),
                  validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.push('/forgot-password'),
                    child: const Text('Forgot password?'),
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
                      : const Text('Sign in'),
                ),
                const SizedBox(height: 8),
                Center(
                  child: TextButton(
                    onPressed: () => context.push('/register'),
                    child: const Text('New here? Create an account'),
                  ),
                ),
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
