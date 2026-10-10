import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/session_user.dart';
import 'auth_controller.dart';

/// Shared by every successful-authentication path (password login, OTP
/// apply, forced password setup, forgot-password reset). Returns an error
/// message to show when the account isn't a LAB account, null on success
/// (after navigating to the dashboard).
Future<String?> completeSignIn(WidgetRef ref, BuildContext context, SessionUser user) async {
  final accepted = await ref.read(authControllerProvider.notifier).onVerified(user);
  if (!accepted) return wrongRoleMessage;
  if (context.mounted) context.go('/');
  return null;
}
