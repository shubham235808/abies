import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

/// `flutter build apk --dart-define=ABIES_ENV=prod -t lib/main_prod.dart`
/// No production environment exists yet — see docs/mobile/CURRENT-BACKEND-API.md §7.
/// This entrypoint must not be used for a real release build until that's resolved.
void main() {
  runApp(const ProviderScope(child: AbiesApp()));
}
