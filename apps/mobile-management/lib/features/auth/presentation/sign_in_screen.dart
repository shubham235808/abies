import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'complete_sign_in.dart';

/// Mirrors the ops web login (apps/management-web/src/app/ops/login/page.tsx:
/// `<PasswordAuthFlow heading="Operations sign-in" subheading="Staff and
/// administrators." />`, no `allowSelfRegistration`, no `otpSignupHref`):
/// password sign-in by mobile or email, "Forgot password?", and nothing
/// else — staff accounts are only ever created by an administrator.
///
/// A legacy account with no password yet (`requiresPasswordSetup: true`)
/// is routed to `/password-setup`, and an ADMIN session needing MFA to
/// `/mfa` — both exactly as the web flow does.
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
        final reset = await ref.read(authApiProvider).requestPasswordReset(mobile: result.mobile);
        if (!mounted || !context.mounted) return;
        context.push('/password-setup', extra: {'requestId': reset.requestId, 'mobile': result.mobile});
        return;
      }
      final error = await completeSignIn(ref, context, user: result.user!, mfaRequired: result.mfaRequired);
      if (error != null && mounted) setState(() => _error = error);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Image.asset('assets/images/abies-mark.png', width: 64, height: 64, excludeFromSemantics: true),
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Chip(
                        label: const Text('Secure access'),
                        labelStyle: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.w700, fontSize: 12),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text('Operations sign-in', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text('Staff and administrators.', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 24),
                    TextFormField(
                      key: const ValueKey('identifier-field'),
                      controller: _identifierController,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Mobile number or email', hintText: '98765 43210 or you@example.com'),
                      validator: validateIdentifier,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const ValueKey('password-field'),
                      controller: _passwordController,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                      validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                      onFieldSubmitted: (_) => _submit(),
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
                      Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _submitting ? null : _submit,
                      child: _submitting
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Sign in'),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Accounts are created by an ABIES administrator. Contact your admin if you need access.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Same rule as the web `LoginStepForm` schema: an email, or at least 10
/// digits of a mobile number.
String? validateIdentifier(String? v) {
  final value = v?.trim() ?? '';
  if (value.isEmpty) return 'Enter your mobile number or email';
  if (value.contains('@')) return null;
  return value.replaceAll(RegExp(r'\D'), '').length >= 10 ? null : 'Enter a 10-digit mobile number or a valid email';
}
