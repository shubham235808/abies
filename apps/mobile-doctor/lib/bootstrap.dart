import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/app_providers.dart';
import 'core/observability/observability.dart';

/// Shared by `main_dev.dart`/`main_uat.dart`/`main_prod.dart` — the flavor
/// itself comes from the `ABIES_ENV` dart-define (`AppEnv.fromDefine()`),
/// not from which entrypoint ran, same as apps/mobile.
void bootstrap() {
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
    child: const AbiesDoctorApp(),
  ));
}
