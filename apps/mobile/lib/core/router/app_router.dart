import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Navigation skeleton (docs/mobile/MOBILE-ARCHITECTURE.md §4). Routes here
/// are Phase 1 placeholders only — each one is a stand-in screen, not a real
/// feature, and is explicitly not "done" (brief §27's own warning against
/// marking placeholders complete). Phases 2-9 replace each placeholder with
/// its real feature screen as that phase lands.
///
/// Deep-link routes (`/doctor/:slug` etc.) must resolve against the real
/// public API before rendering a real screen once built
/// (docs/mobile/API-GAP-ANALYSIS.md §7) — not implemented yet; this skeleton
/// only reserves the route shape.
GoRouter buildAppRouter() {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (context, state) => const _PlaceholderScreen(title: 'ABIES')),
      GoRoute(path: '/sign-in', builder: (context, state) => const _PlaceholderScreen(title: 'Sign in')),
      GoRoute(path: '/doctor/:slug', builder: (context, state) => _PlaceholderScreen(title: 'Doctor ${state.pathParameters['slug']}')),
      GoRoute(path: '/product/:id', builder: (context, state) => _PlaceholderScreen(title: 'Product ${state.pathParameters['id']}')),
      GoRoute(path: '/appointment/:id', builder: (context, state) => _PlaceholderScreen(title: 'Appointment ${state.pathParameters['id']}')),
      GoRoute(path: '/diagnostics/:id', builder: (context, state) => _PlaceholderScreen(title: 'Diagnostics ${state.pathParameters['id']}')),
      GoRoute(path: '/panchakarma/:id', builder: (context, state) => _PlaceholderScreen(title: 'Panchakarma ${state.pathParameters['id']}')),
    ],
  );
}

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title — not built yet (Phase 1 placeholder)')),
    );
  }
}
