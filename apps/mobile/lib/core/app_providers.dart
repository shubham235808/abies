import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'env/app_env.dart';
import 'observability/observability.dart';

/// Root providers (docs/mobile/MOBILE-ARCHITECTURE.md §2). Feature-level
/// providers depend on these, never construct their own [ApiClient] or read
/// [AppEnv] independently.
final appEnvProvider = Provider<AppEnv>((ref) => AppEnv.fromDefine());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(env: ref.watch(appEnvProvider));
  ref.onDispose(client.dispose);
  return client;
});

final observabilityProvider = Provider<Observability>((ref) => const NoopObservability());
