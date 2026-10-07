import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

/// `flutter run --dart-define=ABIES_ENV=uat -t lib/main_uat.dart`
/// No UAT environment exists yet — see docs/mobile/CURRENT-BACKEND-API.md §7.
void main() {
  runApp(const ProviderScope(child: AbiesApp()));
}
