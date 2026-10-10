import 'package:flutter/material.dart';

/// Same rule as the web `LoginFlow`'s identifier schema: an email (has `@`)
/// or a mobile number with at least 10 digits.
String? validateIdentifier(String? v) {
  final value = v?.trim() ?? '';
  if (value.isEmpty) return 'Enter your mobile number or email';
  if (value.contains('@')) return null;
  return value.replaceAll(RegExp(r'\D'), '').length >= 10 ? null : 'Enter a 10-digit mobile number or a valid email';
}

/// `newPasswordField` in auth.schemas.ts: 12-256 chars, no complexity rules.
String? validateNewPassword(String? v) {
  if (v == null || v.length < 12) return 'Password must be at least 12 characters';
  if (v.length > 256) return 'Password is too long';
  return null;
}

/// auth.schemas.ts: `otp: z.string().min(4).max(8)`.
String? validateOtp(String? v) {
  final value = v?.trim() ?? '';
  return (value.length < 4 || value.length > 8) ? 'Enter the code you received' : null;
}

class FormErrorText extends StatelessWidget {
  const FormErrorText(this.message, {super.key});

  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(message!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
    );
  }
}

class BusyFilledButton extends StatelessWidget {
  const BusyFilledButton({super.key, required this.busy, required this.onPressed, required this.label});

  final bool busy;
  final VoidCallback? onPressed;
  final String label;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : Text(label),
    );
  }
}
