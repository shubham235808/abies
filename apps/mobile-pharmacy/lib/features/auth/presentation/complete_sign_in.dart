import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/session_user.dart';
import 'auth_controller.dart';

/// Shared by every successful-authentication path (password login, forced
/// password setup, forgot-password reset, OTP apply) so they can't drift.
/// Returns an error message for the caller to show when the account isn't a
/// pharmacy (see [AuthController.acceptSession]); null after navigating home.
Future<String?> completeSignIn(WidgetRef ref, BuildContext context, SessionUser user) async {
  final error = await ref.read(authControllerProvider.notifier).acceptSession(user);
  if (error != null) return error;
  if (context.mounted) context.go('/');
  return null;
}
