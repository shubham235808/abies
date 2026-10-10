import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/app_providers.dart';
import 'core/env/app_env.dart';
import 'core/observability/sentry_http_observability.dart';

/// `flutter build apk --dart-define=ABIES_ENV=prod -t lib/main_prod.dart`
/// See apps/mobile/lib/main_prod.dart — same environment caveats apply here.
/// This entrypoint must not be used for a real release build until abies.in prod is resolved.
void main() {
  final env = AppEnv.fromDefine();
  // Resolved once, here, before runApp — so the FlutterError/
  // PlatformDispatcher handlers below and app_providers.dart's
  // observabilityProvider (overridden with this exact instance) share one
  // Observability, instead of each independently re-parsing SENTRY_DSN.
  // Real only when a SENTRY_DSN dart-define is supplied; NoopObservability
  // otherwise, which is every build so far (docs/mobile/IMPLEMENTATION-PLAN.md
  // Phase 10).
  final observability = resolveObservability(environment: env.flavor.name);

  // Phase 10: route otherwise-unhandled errors through the Observability
  // abstraction instead of only crashing/printing to the console. Both
  // handlers still let Flutter's own default handling run too (returning
  // false / calling presentError) so nothing about debug-mode behavior
  // regresses — this adds reporting, it doesn't replace the existing
  // crash/log behavior.
  FlutterError.onError = (details) {
    observability.recordError(details.exception, details.stack ?? StackTrace.current, context: 'FlutterError');
    FlutterError.presentError(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    observability.recordError(error, stack, context: 'PlatformDispatcher');
    return false;
  };

  runApp(ProviderScope(
    overrides: [observabilityProvider.overrideWithValue(observability)],
    child: const AbiesApp(),
  ));
}
