# ABIES Mobile Design System (Flutter)

The Flutter-side counterpart to `docs/ABIES-DESIGN-SYSTEM.md`. Same
tokens, same source of truth (`packages/design-system/src/globals.css`),
different runtime. Read this before building or editing any
`apps/mobile/lib/features/**/presentation/*.dart` screen.

All of it lives in one file: `apps/mobile/lib/core/theme/app_theme.dart`.
Nothing downstream should hardcode a `Color(0x...)`, a radius number, or
a bare `Duration(milliseconds: ...)` — use what's documented below.

## 1. Color roles

Access via `Theme.of(context).colorScheme.<role>`.

| Flutter `ColorScheme` role | Real web token | Hex (light) | Why this mapping |
|---|---|---|---|
| `primary` | `--color-brand-purple-500` | `#7A1783` | Purple is the dominant wordmark color and the first hue named in `globals.css`'s own ordering — the color most associated with "ABIES" branding. Use for primary CTAs, FABs, active tab indicators. |
| `onPrimary` | — | white | Contrast color for text/icons on `primary`. |
| `primaryContainer` / `onPrimaryContainer` | `brand-purple-100` / `brand-purple-900` | `#ECDFEE` / `#320D37` | Tinted container for primary-adjacent surfaces (e.g. a selected chip). |
| `secondary` | `--color-brand-magenta-500` | `#C4006E` | Second-most prominent brand hue (globals.css: "magenta... the mark's top swirl"). Use for secondary actions/accents that shouldn't compete with a primary CTA. |
| `secondaryContainer` / `onSecondaryContainer` | `brand-magenta-100` / `brand-magenta-900` | `#F7DBEB` / `#4D052F` | |
| `tertiary` | `--color-brand-blue-500` (same hex as `--color-semantic-info-500`) | `#1F86C8` | `globals.css` itself defines info as `var(--color-brand-blue-500)` — blue already means "informational" on the web (SUBMITTED/RESCHEDULED status badges). Use for informational accents, tertiary emphasis. |
| `tertiaryContainer` / `onTertiaryContainer` | `brand-blue-100` / `brand-blue-900` | `#E0EEF7` / `#123550` | |
| `error` | `--color-semantic-danger-500` | `#DC2626` | A dedicated red, not a brand hue — matches `globals.css`'s own comment that "neither brand hue reads as positive/negative." |
| `errorContainer` / `onErrorContainer` | `semantic-danger-50` / `-700` | `#FEF2F2` / `#B91C1C` | |
| `surface` | real Card background | white | `docs/ABIES-DESIGN-SYSTEM.md` §1.3: "`--color-surface-1: #ffffff` = existing Card background, unchanged." Backs `Card`, `Dialog`, `AppBar`. |
| `onSurface` | `brand-neutral-900` | `#18181D` | |
| `surfaceContainerHighest` | `brand-neutral-100` | `#F0F0F2` | Subtle fills (e.g. Chip background). |
| `onSurfaceVariant` | `brand-neutral-600` (= docs §1.3 `--color-text-muted`) | `#5C5C68` | Muted/secondary text, matches `CardDescription`'s color on web. |
| `outline` | `brand-neutral-300` (= docs §1.3 `--color-border-strong`) | `#C7C7CF` | Stronger borders (e.g. focus-adjacent dividers). |
| `outlineVariant` | `brand-neutral-200` (= docs §1.3 `--color-border-default`) | `#E1E1E6` | Default card/input borders. |
| `scrim` | docs §1.3 `--color-surface-overlay` | `rgba(24,24,29,0.48)` | Modal/drawer scrim. |
| scaffold background (`ThemeData.scaffoldBackgroundColor`) | `brand-neutral-50` (the real `body { @apply bg-brand-neutral-50 }`) | `#F8F8F9` | Page-level background, distinct from `surface` (white), matching the web's page-vs-card distinction. |

**Note on §1.3 "surface" tokens**: `docs/ABIES-DESIGN-SYSTEM.md` §1.3
names `--color-surface-*`/`--color-border-*`/`--color-text-muted` as a
still-additive plan — they are **not yet real CSS custom properties** in
`globals.css` (confirmed by reading it in full). The hex values above for
those roles are the doc's own stated real values (white Card background,
brand-neutral-50 page background, etc.), not a CSS variable reference
that doesn't exist yet. If/when the web adds those as real tokens, update
this table and `app_theme.dart`'s comments to cite the new CSS lines.

### Semantic status colors (no native `ColorScheme` slot)

Flutter's `ColorScheme` only has an `error` role — no success/warning/
info. These are carried as a `ThemeExtension`:

```dart
final semantic = Theme.of(context).extension<AppSemanticColors>()!;
semantic.successBase   // #059669
semantic.warningBase   // #F07800 (= brand-orange-500)
semantic.dangerBase    // #DC2626 (same value as colorScheme.error)
semantic.infoBase      // #1F86C8 (= brand-blue-500, same value as colorScheme.tertiary)
```

Each status exposes `*Subtle` (50-tone), `*Base` (500-tone), `*Strong`
(700-tone) — mirroring `globals.css`'s own
`--color-semantic-{name}-{50,500,700}` triples. Warning reuses the
brand-orange scale and info reuses the brand-blue scale, exactly as
`globals.css` lines 83–91 do (`var(--color-brand-orange-*)` /
`var(--color-brand-blue-*)`) — not independently invented hues.

### Dark mode — an honest caveat

The website has **no real dark-mode tokens today**: `globals.css` sets
`:root { color-scheme: light; }` and defines zero dark overrides anywhere
in the file. There is no "single source of truth" to port for dark mode.
`AppTheme.dark()` and `AppSemanticColors.dark` therefore reuse the exact
same brand hex values as light mode, just remapping which tonal step
(e.g. 300/400 instead of 500/700) sits in which role, following standard
Material 3 practice for deriving a dark scheme from a light one. No new
hue was invented. If the web ever ships real dark tokens, replace this
derivation with the real values.

## 2. Radius — `AppRadius` (`app_theme.dart`)

| Constant | Web token | Value | Applied to (in `app_theme.dart`) |
|---|---|---|---|
| `AppRadius.card` | `--radius-card` (`1.375rem`) | `22.0` px | `CardThemeData.shape` |
| `AppRadius.control` | `--radius-control` (`0.875rem`) | `14.0` px | `ElevatedButtonTheme`/`FilledButtonTheme`/`OutlinedButtonTheme`/`TextButtonTheme` shapes, `InputDecorationThemeData` borders |
| `AppRadius.pill` | `--radius-pill` (`9999px`) | `9999.0` (also `ChipThemeData.shape = StadiumBorder()`) | `ChipThemeData` (closest Material widget to the web's pill badges) |

Conversion basis: 1rem = 16px, the same root font-size Tailwind itself
assumes (no override exists anywhere in the web apps' CSS).

A screen that needs a pill shape outside of `Chip` (e.g. a custom badge
widget) should use `BorderRadius.circular(AppRadius.pill)` or
`StadiumBorder()` directly rather than a literal number.

## 3. Motion — `AppMotion` (`app_theme.dart`)

| Constant | Web token | Value |
|---|---|---|
| `AppMotion.fast` | `--motion-fast` | `Duration(milliseconds: 120)` |
| `AppMotion.normal` | `--motion-normal` | `Duration(milliseconds: 220)` |
| `AppMotion.slow` | `--motion-slow` | `Duration(milliseconds: 360)` |

Nothing in `apps/mobile/lib` defined a named motion duration before this
change — these are new, and the first thing any future
`AnimatedContainer`/`AnimationController`/implicit-animation duration
should reach for instead of a bare millisecond literal.

## 4. Elevation / shadow

The web's `--shadow-brand` token (`0 18px 55px rgba(66, 25, 70, 0.12)`,
a purple-tinted elevation shadow for floating cards) has no pixel-exact
Flutter equivalent — Flutter's Material elevation model draws a
system-computed shadow from `elevation` + `shadowColor`, not an arbitrary
CSS box-shadow. `CardThemeData` in `app_theme.dart` approximates it with
`elevation: 3` and `shadowColor: Color.fromRGBO(66, 25, 70, 0.35)` (same
RGB as the web token, opacity raised because Flutter's shadow render is
lighter than CSS's at equivalent alpha). This is a judgment call, stated
here rather than left implicit — revisit if a future screen needs a
closer visual match.

## 5. Hardcoded-color audit (brief step 2)

`grep -rn "Color(0x" apps/mobile/lib/` (run both before and after this
change) found **exactly one** match, and it was inside the theme file
itself:

```
apps/mobile/lib/core/theme/app_theme.dart:12:  static const _seed = Color(0xFF5B3A8E);
```

(that line is now gone — replaced by the token-based `ColorScheme`
above). No other `Color(0x...)` literal exists anywhere else in
`apps/mobile/lib/` today.

A second, related pattern — Flutter's named `Colors.*` constants, which
bypass the theme the same way a raw hex literal does — turned up one real
hit outside the theme file:

```
apps/mobile/lib/features/network_diagnostics/presentation/connection_diagnostics_screen.dart:82:          Colors.green,
apps/mobile/lib/features/network_diagnostics/presentation/connection_diagnostics_screen.dart:88:          Colors.orange,
apps/mobile/lib/features/network_diagnostics/presentation/connection_diagnostics_screen.dart:97:          Colors.red,
```

These three lines pick an icon tint for a 3-way connection-status switch
(`trusted` / `untrusted` / `networkFailure`). They were **not** changed
in this pass (brief step 2 says report, don't fix), but are flagged as a
**quick, safe swap**:

- `Colors.green` → `Theme.of(context).extension<AppSemanticColors>()!.successBase`
- `Colors.orange` → `Theme.of(context).extension<AppSemanticColors>()!.warningBase`
- `Colors.red` → `Theme.of(context).extension<AppSemanticColors>()!.dangerBase` (or `Theme.of(context).colorScheme.error`, same value)

It's quick and safe because: the surrounding code already takes
`BuildContext` (it's inside `_ResultCard.build`), the three-way switch
maps 1:1 onto the three semantic status roles that now exist, and
nothing about the swap changes layout or behavior — only which `Color`
value is used for an `Icon`'s `color:` parameter.

No other file in `apps/mobile/lib/` was found to reference a named
`Colors.*` constant or `Color(0x...)` literal for a status/brand purpose
(the grep in `docs/mobile-website-design-audit.md` covers the full
command and scope). Screens not yet built (payments, notifications,
contact, support — currently `PHASE.md` stubs with no `.dart` files)
were not and could not be checked, since they don't exist yet.
