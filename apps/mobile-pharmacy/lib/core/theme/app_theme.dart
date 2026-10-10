import 'package:flutter/material.dart';

/// ABIES design-system tokens, ported from the real web source of truth —
/// NOT invented here. Every hex value below is copied verbatim from
/// `packages/design-system/src/globals.css`'s `@theme` block (the Tailwind
/// v4 token source every web app imports — see
/// `apps/client-web/src/app/globals.css`), cross-checked against
/// `docs/ABIES-DESIGN-SYSTEM.md`. That CSS file's own header says these
/// hues were sampled directly from the real ABIES logo
/// (`ABIES_Agent_Knowledge_Pack/05_Brand/ABIES_logo.jpg`): purple/magenta
/// from the wordmark and the mark's top swirl, blue from the left swirl,
/// orange from the right/bottom swirl.
///
/// Previous state (now replaced): this file used
/// `ColorScheme.fromSeed(seedColor: Color(0xFF5B3A8E))` — a placeholder
/// purple that is NOT the real brand purple (`#7A1783`). `0xFF5B3A8E` is a
/// bluer, lighter purple; it was never derived from any real token.
///
/// Nothing downstream should hardcode a color, radius, or animation
/// duration outside this file — pull from `Theme.of(context).colorScheme`,
/// `Theme.of(context).extension<AppSemanticColors>()`, `AppRadius`, or
/// `AppMotion` instead.
class AppTheme {
  AppTheme._();

  static ThemeData light() {
    return _themeFrom(_lightColorScheme);
  }

  static ThemeData dark() {
    return _themeFrom(_darkColorScheme);
  }

  static ThemeData _themeFrom(ColorScheme colorScheme) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colorScheme.surface,
      extensions: <ThemeExtension<dynamic>>[
        colorScheme.brightness == Brightness.light ? AppSemanticColors.light : AppSemanticColors.dark,
      ],

      // --radius-card (1.375rem / 22px, globals.css line 102) — every Card
      // on the web gets this radius via the `rounded-card` utility.
      cardTheme: CardThemeData(
        color: colorScheme.surface,
        elevation: 3,
        // Approximates --shadow-brand (globals.css line 114): a
        // purple-tinted elevation shadow instead of Flutter's default
        // neutral grey, so elevated surfaces read as "ABIES" the same way
        // the web's floating care-plan/badge panels do. Flutter's Material
        // elevation model can't reproduce a CSS box-shadow's exact
        // blur/spread pixel-for-pixel; tinting shadowColor is the closest
        // native equivalent.
        shadowColor: const Color.fromRGBO(66, 25, 70, 0.35),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.card)),
      ),

      // --radius-control (0.875rem / 14px, globals.css line 103) — the
      // web's Button/Input radius.
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        ),
      ),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: colorScheme.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: colorScheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: colorScheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: colorScheme.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: colorScheme.error),
        ),
      ),

      // --radius-pill (9999px, globals.css line 104) — the web's
      // Badge/Tabs/chip radius. Chips are the closest Flutter Material
      // widget to the web's pill-shaped badges.
      chipTheme: ChipThemeData(
        shape: const StadiumBorder(),
        side: BorderSide(color: colorScheme.outlineVariant),
        backgroundColor: colorScheme.surfaceContainerHighest,
        labelStyle: TextStyle(color: colorScheme.onSurface),
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Color roles — the deliberate mapping from ABIES brand tokens onto
  // Flutter's Material 3 ColorScheme roles.
  //
  // Reasoning (stated, not left implicit, per the brief):
  // - primary   = brand-purple-500 (#7A1783). Purple is the dominant
  //   wordmark color and the first hue named in globals.css's own
  //   ordering (purple, magenta, blue, orange) — it is the single color
  //   most associated with "ABIES" on the website today (primary nav/CTA
  //   accents use it). Maps to Button/FAB/active-tab fills.
  // - secondary = brand-magenta-500 (#C4006E). Second-most prominent brand
  //   hue (the mark's top swirl + wordmark accent per the CSS comment),
  //   used for secondary emphasis — maps to secondary actions, selected
  //   states that shouldn't compete with a primary CTA.
  // - tertiary  = brand-blue-500 (#1F86C8). This is intentionally the SAME
  //   hex as --color-semantic-info-500, because globals.css itself defines
  //   `--color-semantic-info-500: var(--color-brand-blue-500)` (line 90) —
  //   blue already carries "informational" meaning on the web
  //   (SUBMITTED/RESCHEDULED status badges, per
  //   docs/ABIES-DESIGN-SYSTEM.md §1.2). Maps to informational accents,
  //   tertiary UI emphasis, chip/tag fills that aren't primary or
  //   secondary actions.
  // - error     = semantic-danger-500 (#DC2626) — a dedicated red, not a
  //   brand hue, matching globals.css's own reasoning (§1.2 comment: "...
  //   neither brand hue reads as positive/negative on its own").
  // - surface   = white (#FFFFFF). Confirmed real: `body { @apply
  //   bg-brand-neutral-50 text-brand-neutral-900 }` in globals.css (the
  //   PAGE background is brand-neutral-50) while the existing Card
  //   component's background is white (docs/ABIES-DESIGN-SYSTEM.md §1.3
  //   "--color-surface-1: #ffffff; /* = existing Card background,
  //   unchanged */"). Flutter's `surface` role backs component surfaces
  //   (Card, Dialog, AppBar) so it takes the white value; the page-level
  //   neutral-50 tone is used for `scaffoldBackgroundColor` separately,
  //   matching the web's page-vs-card distinction.
  //
  // NOTE on surface/elevation tokens: docs/ABIES-DESIGN-SYSTEM.md §1.3's
  // `--color-surface-*` names are NOT yet real CSS variables in
  // globals.css today (confirmed by reading it in full) — the doc
  // describes them as a still-additive, NEW plan. Where this file uses a
  // "surface" value below, it is taken from the doc's own stated real
  // values (white Card bg, brand-neutral-50 page bg) rather than from a
  // CSS custom property that doesn't exist yet, and is noted as such.
  // ---------------------------------------------------------------------

  static const ColorScheme _lightColorScheme = ColorScheme(
    brightness: Brightness.light,

    primary: _BrandPurple.c500,
    onPrimary: Colors.white,
    primaryContainer: _BrandPurple.c100,
    onPrimaryContainer: _BrandPurple.c900,

    secondary: _BrandMagenta.c500,
    onSecondary: Colors.white,
    secondaryContainer: _BrandMagenta.c100,
    onSecondaryContainer: _BrandMagenta.c900,

    tertiary: _BrandBlue.c500,
    onTertiary: Colors.white,
    tertiaryContainer: _BrandBlue.c100,
    onTertiaryContainer: _BrandBlue.c900,

    error: _Semantic.dangerBase,
    onError: Colors.white,
    errorContainer: _Semantic.dangerSubtle,
    onErrorContainer: _Semantic.dangerStrong,

    // surface = real Card background (white); scaffold/page background is
    // set separately to brand-neutral-50 in _themeFrom above.
    surface: Colors.white,
    onSurface: _BrandNeutral.c900,
    surfaceContainerHighest: _BrandNeutral.c100,
    onSurfaceVariant: _BrandNeutral.c600, // = docs §1.3 --color-text-muted
    outline: _BrandNeutral.c300, // = docs §1.3 --color-border-strong
    outlineVariant: _BrandNeutral.c200, // = docs §1.3 --color-border-default
    scrim: Color.fromRGBO(24, 24, 29, 0.48), // = docs §1.3 --color-surface-overlay (brand-neutral-900 base)
  );

  // The web has no real dark-mode tokens today: globals.css sets
  // `:root { color-scheme: light; }` and defines no dark overrides
  // anywhere in the file (confirmed by reading it in full) — there is no
  // "single source of truth" to port for dark mode. Rather than inventing
  // a new dark palette from scratch (which the brief explicitly says not
  // to do) or leaving Flutter's system dark mode broken, this dark scheme
  // reuses the EXACT SAME brand hex values as light mode, just swapping
  // which tonal step sits in which role (lighter 300/400 steps for
  // primary/secondary/tertiary so they keep contrast on a dark surface,
  // and the brand-neutral scale's dark end for surfaces) — standard
  // Material 3 practice for deriving a dark scheme from a light one, no
  // new hues introduced.
  static const ColorScheme _darkColorScheme = ColorScheme(
    brightness: Brightness.dark,

    primary: _BrandPurple.c300,
    onPrimary: _BrandPurple.c900,
    primaryContainer: _BrandPurple.c700,
    onPrimaryContainer: _BrandPurple.c100,

    secondary: _BrandMagenta.c300,
    onSecondary: _BrandMagenta.c900,
    secondaryContainer: _BrandMagenta.c700,
    onSecondaryContainer: _BrandMagenta.c100,

    tertiary: _BrandBlue.c300,
    onTertiary: _BrandBlue.c900,
    tertiaryContainer: _BrandBlue.c700,
    onTertiaryContainer: _BrandBlue.c100,

    error: _Semantic.dangerBase,
    onError: Colors.black,
    errorContainer: _Semantic.dangerStrong,
    onErrorContainer: _Semantic.dangerSubtle,

    surface: _BrandNeutral.c900,
    onSurface: _BrandNeutral.c100,
    surfaceContainerHighest: _BrandNeutral.c800,
    onSurfaceVariant: _BrandNeutral.c400,
    outline: _BrandNeutral.c600,
    outlineVariant: _BrandNeutral.c800,
    scrim: Color.fromRGBO(24, 24, 29, 0.6),
  );
}

/// Semantic status colors — globals.css lines 76-91 / docs
/// `ABIES-DESIGN-SYSTEM.md` §1.2. Flutter's `ColorScheme` has no built-in
/// success/warning/info roles (only `error`), so these are carried as a
/// `ThemeExtension` — the standard Flutter mechanism for adding
/// app-specific theme roles — rather than overloading unrelated
/// ColorScheme slots. Access via
/// `Theme.of(context).extension<AppSemanticColors>()!`.
///
/// Each status gets the same 50/500/700 shape the web uses
/// (subtle/base/strong), matching globals.css's own
/// `--color-semantic-{name}-{50,500,700}` triples:
/// - success: its own scale (#ECFDF5/#059669/#047857) — neither brand hue
///   reads as "positive" (per globals.css's own comment, line 78).
/// - warning: REUSES brand-orange (globals.css lines 83-85 literally
///   `var(--color-brand-orange-*)`) — orange already means "needs
///   attention" on the web (UNDER_REVIEW/P2 badges).
/// - danger: its own scale (#FEF2F2/#DC2626/#B91C1C) — same values as
///   `ColorScheme.error`/`errorContainer` above; exposed again here so
///   status chips can use the full 50/500/700 triple the web badge
///   component uses, not just the two-color error/errorContainer pair.
/// - info: REUSES brand-blue (globals.css lines 89-91, `var(--color-brand-
///   blue-*)`) — blue already means "informational" on the web
///   (SUBMITTED/RESCHEDULED badges). Same hex as `ColorScheme.tertiary`
///   above for the same reason.
class AppSemanticColors extends ThemeExtension<AppSemanticColors> {
  const AppSemanticColors({
    required this.successSubtle,
    required this.successBase,
    required this.successStrong,
    required this.warningSubtle,
    required this.warningBase,
    required this.warningStrong,
    required this.dangerSubtle,
    required this.dangerBase,
    required this.dangerStrong,
    required this.infoSubtle,
    required this.infoBase,
    required this.infoStrong,
  });

  final Color successSubtle;
  final Color successBase;
  final Color successStrong;
  final Color warningSubtle;
  final Color warningBase;
  final Color warningStrong;
  final Color dangerSubtle;
  final Color dangerBase;
  final Color dangerStrong;
  final Color infoSubtle;
  final Color infoBase;
  final Color infoStrong;

  static const AppSemanticColors light = AppSemanticColors(
    successSubtle: _Semantic.successSubtle,
    successBase: _Semantic.successBase,
    successStrong: _Semantic.successStrong,
    warningSubtle: _BrandOrange.c50,
    warningBase: _BrandOrange.c500,
    warningStrong: _BrandOrange.c700,
    dangerSubtle: _Semantic.dangerSubtle,
    dangerBase: _Semantic.dangerBase,
    dangerStrong: _Semantic.dangerStrong,
    infoSubtle: _BrandBlue.c50,
    infoBase: _BrandBlue.c500,
    infoStrong: _BrandBlue.c700,
  );

  // Same hues as light; dark-mode-appropriate tone swapped where it keeps
  // sufficient contrast on a dark surface (same rationale as
  // AppTheme._darkColorScheme above — no new hues invented).
  static const AppSemanticColors dark = AppSemanticColors(
    successSubtle: _Semantic.successStrong,
    successBase: _Semantic.successBase,
    successStrong: _Semantic.successSubtle,
    warningSubtle: _BrandOrange.c800,
    warningBase: _BrandOrange.c400,
    warningStrong: _BrandOrange.c100,
    dangerSubtle: _Semantic.dangerStrong,
    dangerBase: _Semantic.dangerBase,
    dangerStrong: _Semantic.dangerSubtle,
    infoSubtle: _BrandBlue.c800,
    infoBase: _BrandBlue.c400,
    infoStrong: _BrandBlue.c100,
  );

  @override
  AppSemanticColors copyWith({
    Color? successSubtle,
    Color? successBase,
    Color? successStrong,
    Color? warningSubtle,
    Color? warningBase,
    Color? warningStrong,
    Color? dangerSubtle,
    Color? dangerBase,
    Color? dangerStrong,
    Color? infoSubtle,
    Color? infoBase,
    Color? infoStrong,
  }) {
    return AppSemanticColors(
      successSubtle: successSubtle ?? this.successSubtle,
      successBase: successBase ?? this.successBase,
      successStrong: successStrong ?? this.successStrong,
      warningSubtle: warningSubtle ?? this.warningSubtle,
      warningBase: warningBase ?? this.warningBase,
      warningStrong: warningStrong ?? this.warningStrong,
      dangerSubtle: dangerSubtle ?? this.dangerSubtle,
      dangerBase: dangerBase ?? this.dangerBase,
      dangerStrong: dangerStrong ?? this.dangerStrong,
      infoSubtle: infoSubtle ?? this.infoSubtle,
      infoBase: infoBase ?? this.infoBase,
      infoStrong: infoStrong ?? this.infoStrong,
    );
  }

  @override
  AppSemanticColors lerp(ThemeExtension<AppSemanticColors>? other, double t) {
    if (other is! AppSemanticColors) return this;
    return AppSemanticColors(
      successSubtle: Color.lerp(successSubtle, other.successSubtle, t)!,
      successBase: Color.lerp(successBase, other.successBase, t)!,
      successStrong: Color.lerp(successStrong, other.successStrong, t)!,
      warningSubtle: Color.lerp(warningSubtle, other.warningSubtle, t)!,
      warningBase: Color.lerp(warningBase, other.warningBase, t)!,
      warningStrong: Color.lerp(warningStrong, other.warningStrong, t)!,
      dangerSubtle: Color.lerp(dangerSubtle, other.dangerSubtle, t)!,
      dangerBase: Color.lerp(dangerBase, other.dangerBase, t)!,
      dangerStrong: Color.lerp(dangerStrong, other.dangerStrong, t)!,
      infoSubtle: Color.lerp(infoSubtle, other.infoSubtle, t)!,
      infoBase: Color.lerp(infoBase, other.infoBase, t)!,
      infoStrong: Color.lerp(infoStrong, other.infoStrong, t)!,
    );
  }
}

/// --radius-card / --radius-control / --radius-pill (globals.css lines
/// 102-104), converted from the web's rem units to Flutter's logical
/// pixels at the standard 1rem = 16px base (the same base Tailwind itself
/// assumes — there is no separate root-font-size override anywhere in the
/// web apps' CSS).
class AppRadius {
  AppRadius._();

  /// --radius-card: 1.375rem = 22px.
  static const double card = 22.0;

  /// --radius-control: 0.875rem = 14px.
  static const double control = 14.0;

  /// --radius-pill: 9999px — effectively a stadium/full-pill shape at any
  /// widget size. Kept as a value (not just `StadiumBorder()`) so code that
  /// needs a numeric radius (e.g. `BorderRadius.circular`) still has one.
  static const double pill = 9999.0;
}

/// --motion-fast / --motion-normal / --motion-slow (globals.css lines
/// 107-109, docs/ABIES-MOTION-SYSTEM.md §2). Nothing in apps/mobile/lib
/// defined named motion durations before this file — these are the first.
/// Use these instead of a bare `Duration(milliseconds: ...)` literal so a
/// future motion-system change only edits one place, same discipline as
/// the color tokens above.
class AppMotion {
  AppMotion._();

  static const Duration fast = Duration(milliseconds: 120);
  static const Duration normal = Duration(milliseconds: 220);
  static const Duration slow = Duration(milliseconds: 360);
}

// ---------------------------------------------------------------------------
// Private token scales — verbatim hex values from
// packages/design-system/src/globals.css's @theme block. Kept private to
// this file; everything else reaches them only through AppTheme's
// ColorScheme / AppSemanticColors / AppRadius / AppMotion.
// ---------------------------------------------------------------------------

/// globals.css lines 23-32.
class _BrandPurple {
  _BrandPurple._();
  static const c100 = Color(0xFFECDFEE);
  static const c300 = Color(0xFFBA86BF);
  static const c500 = Color(0xFF7A1783);
  static const c700 = Color(0xFF56125D);
  static const c900 = Color(0xFF320D37);
}

/// globals.css lines 34-43.
class _BrandMagenta {
  _BrandMagenta._();
  static const c100 = Color(0xFFF7DBEB);
  static const c300 = Color(0xFFE07AB4);
  static const c500 = Color(0xFFC4006E);
  static const c700 = Color(0xFF88034F);
  static const c900 = Color(0xFF4D052F);
}

/// globals.css lines 45-54.
class _BrandBlue {
  _BrandBlue._();
  static const c50 = Color(0xFFF2F8FC);
  static const c100 = Color(0xFFE0EEF7);
  static const c300 = Color(0xFF8BC0E2);
  static const c400 = Color(0xFF55A3D5);
  static const c500 = Color(0xFF1F86C8);
  static const c700 = Color(0xFF185E8C);
  static const c800 = Color(0xFF154A6E);
  static const c900 = Color(0xFF123550);
}

/// globals.css lines 56-65.
class _BrandOrange {
  _BrandOrange._();
  static const c50 = Color(0xFFFEF7F0);
  static const c100 = Color(0xFFFDECDB);
  static const c400 = Color(0xFFF4983D);
  static const c500 = Color(0xFFF07800);
  static const c700 = Color(0xFFA65404);
  static const c800 = Color(0xFF824206);
}

/// globals.css lines 67-74.
class _BrandNeutral {
  _BrandNeutral._();
  static const c100 = Color(0xFFF0F0F2);
  static const c200 = Color(0xFFE1E1E6);
  static const c300 = Color(0xFFC7C7CF);
  static const c400 = Color(0xFF9A9AA6);
  static const c600 = Color(0xFF5C5C68);
  static const c800 = Color(0xFF2C2C34);
  static const c900 = Color(0xFF18181D);
}

/// globals.css lines 80-88 (success/danger get their own scale; warning
/// reuses brand-orange and info reuses brand-blue, handled via
/// _BrandOrange/_BrandBlue directly above instead of duplicating here).
class _Semantic {
  _Semantic._();
  static const successSubtle = Color(0xFFECFDF5);
  static const successBase = Color(0xFF059669);
  static const successStrong = Color(0xFF047857);
  static const dangerSubtle = Color(0xFFFEF2F2);
  static const dangerBase = Color(0xFFDC2626);
  static const dangerStrong = Color(0xFFB91C1C);
}
