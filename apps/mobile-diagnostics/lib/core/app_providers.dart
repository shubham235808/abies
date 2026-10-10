import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'env/app_env.dart';
import 'observability/observability.dart';
import 'observability/sentry_http_observability.dart';

/// Root providers (docs/mobile/MOBILE-ARCHITECTURE.md §2). Feature-level
/// providers depend on these, never construct their own [ApiClient] or read
/// [AppEnv] independently.
final appEnvProvider = Provider<AppEnv>((ref) => AppEnv.fromDefine());

/// Real only when `SENTRY_DSN` is supplied at build time
/// (`resolveObservability()` — see `sentry_http_observability.dart`);
/// [NoopObservability] otherwise, which is every build so far. `main_dev.
/// dart`/`main_uat.dart`/`main_prod.dart` resolve this same value *before*
/// `runApp` (so `FlutterError`/`PlatformDispatcher` handlers installed
/// there can use it too) and override this provider with that exact
/// instance, so the whole app — including this provider's own dependents
/// below — shares one instance rather than each resolving its own.
final observabilityProvider = Provider<Observability>((ref) {
  final env = ref.watch(appEnvProvider);
  return resolveObservability(environment: env.flavor.name);
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(env: ref.watch(appEnvProvider), observability: ref.watch(observabilityProvider));
  ref.onDispose(client.dispose);
  return client;
});
