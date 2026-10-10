import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'complete_sign_in.dart';

/// Password sign-in, primary path — mirrors
/// apps/partner-web/src/app/partner/login/page.tsx (`PasswordAuthFlow`):
/// already-approved partners sign in with a password; a brand-new pharmacy
/// applies via the OTP flow at `/apply` (secondary link below).
/// `POST /api/v1/auth/login` with either a mobile number or an email, never
/// both (`loginSchema`'s `.refine()`).
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
      final api = ref.read(authApiProvider);
      final result = await api.login(
        mobile: isEmail ? null : identifier,
        email: isEmail ? identifier : null,
        password: _passwordController.text,
      );
      if (!mounted) return;
      if (result.requiresPasswordSetup) {
        // No password yet (e.g. an account created via the OTP apply flow) —
        // prove control of the mobile first, then set one.
        final reset = await api.requestPasswordReset(mobile: result.mobile);
        if (!mounted) return;
        context.push('/password-setup', extra: {'requestId': reset.requestId, 'mobile': result.mobile});
        return;
      }
      if (result.mfaRequired) {
        setState(() => _error = 'This account requires additional verification not supported in this app.');
        return;
      }
      final error = await completeSignIn(ref, context, result.user!);
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
                Text('ABIES Pharmacy', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                const Text('Sign in with the mobile number or email on your pharmacy account.'),
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
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Sign in'),
                ),
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 8),
                Text('New pharmacy partner?', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                const Text("Apply with a one-time code — we'll create your partner account and you can complete your profile for verification."),
                const SizedBox(height: 12),
                OutlinedButton(
                  key: const ValueKey('apply-button'),
                  onPressed: () => context.push('/apply'),
                  child: const Text('Apply as a pharmacy partner'),
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
/// is an email, otherwise it must contain at least 10 digits.
String? validateIdentifier(String? v) {
  final value = v?.trim() ?? '';
  if (value.isEmpty) return 'Enter your mobile number or email';
  if (value.contains('@')) return null;
  return value.replaceAll(RegExp(r'\D'), '').length >= 10 ? null : 'Enter a 10-digit mobile number or a valid email';
}
