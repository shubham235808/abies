import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/session_user.dart';
import 'auth_controller.dart';

/// Shared by every successful-authentication path. Returns null when
/// navigation happened, or a user-facing message to show inline (an account
/// this app doesn't serve).
///
/// [user] + [mfaRequired] come straight from `POST /auth/login`; pass
/// `user: null` after password setup/reset, whose responses don't carry an
/// MFA flag — the controller then asks `GET /auth/me` instead.
Future<String?> completeSignIn(WidgetRef ref, BuildContext context, {SessionUser? user, bool mfaRequired = false}) async {
  final controller = ref.read(authControllerProvider.notifier);
  final error = user == null ? await controller.syncFromServer() : await controller.onAuthenticated(user, mfaRequired: mfaRequired);
  if (error != null) return error;
  if (!context.mounted) return null;
  final pendingMfa = ref.read(authControllerProvider).valueOrNull?.isMfaPending ?? false;
  context.go(pendingMfa ? '/mfa' : '/');
  return null;
}
