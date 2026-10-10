import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../pharmacy/presentation/cart_controller.dart';
import '../../pharmacy/presentation/local_cart_controller.dart';
import '../../pharmacy/presentation/medicine_search_controller.dart' show pharmacyApiProvider;
import '../domain/session_user.dart';
import 'auth_controller.dart';
import 'pending_redirect.dart';

/// Shared by every successful-authentication path (password login,
/// registration, forced password setup, forgot-password reset) — one place
/// for "update auth state, flush the guest cart, return to whatever the
/// visitor was doing" so the call sites can't drift on it.
Future<void> completeSignIn(WidgetRef ref, BuildContext context, SessionUser user) async {
  ref.read(authControllerProvider.notifier).onVerified(user);
  // Best-effort — never blocks sign-in or navigation on a flush failure (see
  // `LocalCartController.flushToBackend`'s own doc comment). Any item it
  // couldn't push stays in the local cart for next time.
  await ref.read(localCartControllerProvider.notifier).flushToBackend(
        api: ref.read(pharmacyApiProvider),
        invalidateCart: () => ref.invalidate(cartControllerProvider),
      );
  if (!context.mounted) return;
  // "Return the customer to the exact action they were performing" —
  // `pendingRedirectProvider` is set either by the router's redirect (an
  // unauthenticated visit to a protected route) or by a screen's own "this
  // one action needs auth" check; null just means there was nothing
  // specific to return to, so home is right.
  final pending = ref.read(pendingRedirectProvider);
  ref.read(pendingRedirectProvider.notifier).state = null;
  if (pending != null) {
    context.go(pending.location, extra: pending.extra);
  } else {
    context.go('/');
  }
}
