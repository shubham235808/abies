import 'package:flutter/material.dart';

/// Design-system tokens (docs/mobile/MOBILE-ARCHITECTURE.md §1 "design
/// system"). Placeholder values — Agent 3's actual palette/typography work
/// (brief §3) replaces these; nothing downstream should hardcode a color or
/// text style outside this file.
class AppTheme {
  AppTheme._();

  // Placeholder brand colors. Not the final ABIES palette — swap these once
  // the design system work lands, in this one place.
  static const _seed = Color(0xFF5B3A8E);

  static ThemeData light() {
    return ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: _seed, brightness: Brightness.light),
      useMaterial3: true,
    );
  }

  static ThemeData dark() {
    return ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: _seed, brightness: Brightness.dark),
      useMaterial3: true,
    );
  }
}
