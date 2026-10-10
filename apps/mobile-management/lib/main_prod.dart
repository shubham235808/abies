import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/app_providers.dart';
import 'core/observability/observability.dart';

/// `flutter run --dart-define=ABIES_ENV=prod -t lib/main_prod.dart`
///
/// The base URL comes from the ABIES_ENV dart-define (core/env/app_env.dart),
/// exactly as in apps/mobile — this entrypoint only wires error reporting.
void main() {
  const Observability observability = NoopObservability();

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
    child: const AbiesOpsApp(),
  ));
}
