import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

/// `flutter run --dart-define=ABIES_ENV=dev -t lib/main_dev.dart`
void main() {
  runApp(const ProviderScope(child: AbiesApp()));
}
