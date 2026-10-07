import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/presentation/auth_controller.dart';

/// Bare post-sign-in landing screen. The real personalized dashboard
/// (promotional banners, doctors, upcoming appointments, etc.) is Phase 3
/// (docs/mobile/IMPLEMENTATION-PLAN.md) — this exists only so Phase 2's
/// auth flow has somewhere real to land and a way to reach the profile
/// screen and sign out, not as a stand-in for that phase's design.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).value;
    final user = auth?.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('ABIES Ayurveda'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(user == null ? 'Signed in' : 'Signed in as ${user.email ?? user.mobile}'),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => context.push('/profile'), child: const Text('My profile')),
          ],
        ),
      ),
    );
  }
}
