import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'complete_sign_in.dart';

/// Primary sign-in: `POST /api/v1/auth/login` with either a mobile number or
/// an email — never both, matching the backend's `.refine()` on
/// `loginSchema`. Same structure as the partner web portal's
/// `PasswordAuthFlow` (apps/partner-web/src/app/partner/login/page.tsx): a
/// legacy OTP-only account (`requiresPasswordSetup: true`) is routed to
/// `/password-setup`, and the secondary "Apply as a centre" link is the
/// OTP-based onboarding path (`/apply`).
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
        context.push('/password-setup', extra: {'requestId': reset.requestId, 'mobile': result.mobile});
        return;
      }
      if (result.mfaRequired) {
        setState(() => _error = 'This account requires additional verification not supported in this app.');
        return;
      }
      final refused = await completeSignIn(ref, context, result.user!);
      if (refused != null && mounted) setState(() => _error = refused);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Partner sign-in')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Image.asset('assets/images/abies-mark.png', width: 64, height: 64, excludeFromSemantics: true),
                ),
                const SizedBox(height: 16),
                Text('ABIES Panchakarma Partner', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                const Text('Sign in to manage your centre’s bookings, therapies and therapists.'),
                const SizedBox(height: 24),
                TextFormField(
                  key: const ValueKey('identifier-field'),
                  controller: _identifierController,
                  keyboardType: TextInputType.emailAddress,
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
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 8),
                Text('New Panchakarma centre?', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                OutlinedButton(
                  onPressed: () => context.push('/apply'),
                  child: const Text('Apply with a one-time code'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Same rule as the web `LoginFlow`'s identifier schema: anything with "@"
/// is an email; otherwise at least 10 digits.
String? validateIdentifier(String? v) {
  final value = v?.trim() ?? '';
  if (value.isEmpty) return 'Enter your mobile number or email';
  if (value.contains('@')) return null;
  return value.replaceAll(RegExp(r'\D'), '').length >= 10 ? null : 'Enter a 10-digit mobile number or a valid email';
}
