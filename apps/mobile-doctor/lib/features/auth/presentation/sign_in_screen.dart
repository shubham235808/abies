import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/form_bits.dart';
import 'sign_in_controller.dart';

/// Password-first sign-in for approved doctors — `POST /api/v1/auth/login`
/// with either a mobile number or an email, matching the web partner
/// portal's `PasswordAuthFlow` (apps/partner-web/src/app/partner/login/
/// page.tsx). Brand-new doctors go to `/apply` (the OTP self-onboarding
/// path, same split as `otpSignupHref="/partner/login/apply"` on the web).
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
    final outcome = await ref
        .read(signInControllerProvider)
        .signIn(identifier: _identifierController.text, password: _passwordController.text);
    if (!mounted) return;
    setState(() => _submitting = false);
    switch (outcome) {
      case SignedIn():
        context.go('/');
      case NeedsPasswordSetup(:final requestId, :final mobile):
        context.push('/password-setup', extra: {'requestId': requestId, 'mobile': mobile});
      case SignInFailed(:final message):
        setState(() => _error = message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 24),
                Center(
                  child: Image.asset('assets/images/abies-mark.png', width: 64, height: 64, excludeFromSemantics: true),
                ),
                const SizedBox(height: 16),
                Text('ABIES for Doctors', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                const Text('Sign in with the mobile number or email on your doctor account.'),
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
                FormErrorText(_error),
                const SizedBox(height: 16),
                BusyFilledButton(busy: _submitting, onPressed: _submit, label: 'Sign in'),
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 8),
                Text('New to ABIES?', style: Theme.of(context).textTheme.titleSmall, textAlign: TextAlign.center),
                const SizedBox(height: 4),
                const Text(
                  "Doctor accounts are verified by the ABIES team. Apply with a one-time code and we'll guide you through verification.",
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => context.push('/apply'),
                  child: const Text('Apply as a doctor'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
