import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';

/// `POST /api/v1/auth/otp/verify`. `acceptedTerms` is required on *every*
/// verify, not only sign-up — the backend rejects `false` outright and
/// re-accepts every active required consent artifact on every successful
/// login (`auth.service.ts`'s `verifyOtp`) — so this checkbox always shows,
/// not only for a new account. `name` is required by the backend only when
/// [isNewAccount] is true.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.requestId, required this.isNewAccount, this.devOtp});

  final String requestId;
  final bool isNewAccount;
  final String? devOtp;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _otpController = TextEditingController();
  final _nameController = TextEditingController();
  bool _acceptedTerms = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.devOtp != null) _otpController.text = widget.devOtp!;
  }

  @override
  void dispose() {
    _otpController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_acceptedTerms) {
      setState(() => _error = 'Please accept the Terms of Service and Privacy Policy to continue');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(authApiProvider).verifyOtp(
            requestId: widget.requestId,
            otp: _otpController.text.trim(),
            acceptedTerms: _acceptedTerms,
            name: widget.isNewAccount ? _nameController.text.trim() : null,
          );
      if (result.mfaRequired) {
        // Admin MFA only — a PATIENT account should never reach this
        // (docs/mobile/CURRENT-BACKEND-API.md §3). Surfaced rather than
        // silently ignored, since it means something unexpected happened.
        setState(() => _error = 'This account requires additional verification not supported in this app.');
        return;
      }
      ref.read(authControllerProvider.notifier).onVerified(result.user);
      if (!mounted) return;
      context.go('/');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Enter the code')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (widget.isNewAccount) ...[
                  TextFormField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: 'Your name'),
                    validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your name' : null,
                  ),
                  const SizedBox(height: 16),
                ],
                TextFormField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'One-time code'),
                  validator: (v) => (v == null || v.trim().length < 4) ? 'Enter the code you received' : null,
                ),
                const SizedBox(height: 16),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _acceptedTerms,
                  onChanged: (v) => setState(() => _acceptedTerms = v ?? false),
                  title: const Text("I agree to ABIES's Terms of Service and Privacy Policy"),
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
