import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth_controller.dart';

/// ADMIN MFA step — the native equivalent of the web `MfaForm`
/// (packages/design-system/src/components/auth/mfa-form.tsx):
/// `POST /api/v1/auth/mfa/verify` with `{ code }`. Note the backend
/// hard-fails this on a locked-down (production) deployment until a real MFA
/// provider is configured (`verifyAdminMfa` in auth.service.ts) — that
/// message is shown as-is rather than hidden.
class MfaScreen extends ConsumerStatefulWidget {
  const MfaScreen({super.key});

  @override
  ConsumerState<MfaScreen> createState() => _MfaScreenState();
}

class _MfaScreenState extends ConsumerState<MfaScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final error = await ref.read(authControllerProvider.notifier).verifyMfa(_codeController.text.trim());
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _error = error;
    });
    if (error == null) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Verify it’s you'),
        actions: [
          TextButton(
            onPressed: _submitting ? null : () => ref.read(authControllerProvider.notifier).signOut(),
            child: const Text('Sign out'),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Administrator accounts require an extra verification step.'),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _codeController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Admin verification code'),
                  // verifyMfaSchema: z.string().min(4).max(10).
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.length < 4 || value.length > 10) return 'Enter your verification code';
                    return null;
                  },
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
                      : const Text('Verify'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
