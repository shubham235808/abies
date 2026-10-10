import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/session_user.dart';
import 'auth_controller.dart';

/// Shared by every successful-authentication path (password login, forced
/// password setup, forgot-password reset, OTP apply) so the call sites
/// can't drift. Returns a user-facing error message when the account was
/// refused (wrong role), or null after navigating home.
Future<String?> completeSignIn(WidgetRef ref, BuildContext context, SessionUser user) async {
  final error = await ref.read(authControllerProvider.notifier).acceptAuthenticated(user);
  if (error != null) return error;
  if (context.mounted) context.go('/');
  return null;
}
