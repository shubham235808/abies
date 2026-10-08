# Mobile/Website Design Parity Audit

Scope: "WEBSITE-TO-MOBILE UI/UX PARITY" — port the REAL ABIES design
tokens into the Flutter mobile app's theme. The website is the single
source of truth; nothing in this change invents a new design.

## What was read (in full, before writing any code)

1. **`packages/design-system/src/globals.css`** (179 lines) — the
   canonical Tailwind v4 `@theme` token block every web app (client-web,
   partner-web, management-web) imports. Its own header comment states
   the palette was "sampled directly from
   `ABIES_Agent_Knowledge_Pack/05_Brand/ABIES_logo.jpg`, not guessed":
   purple/magenta from the wordmark and the mark's top swirl, blue from
   the left swirl, orange from the right/bottom swirl. Also defines
   semantic success/warning/danger/info tokens, three gradient tokens,
   three radius tokens, three motion-duration tokens, and one brand-tinted
   shadow token.
2. **`docs/ABIES-DESIGN-SYSTEM.md`** (261 lines, read in full) — the
   fuller spec. Confirms §1.1's brand scales are "existing, unchanged";
   documents the reasoning behind the semantic warning/info tokens
   reusing the orange/blue brand scales instead of inventing new hues
   (§1.2); describes `--color-surface-*`/`--color-border-*`/
   `--color-text-muted` role tokens (§1.3) that are the DOCUMENTED
   target but are **not yet real CSS custom properties** in
   `globals.css` today (confirmed by reading `globals.css` in full — no
   `--color-surface-*` lines exist there); and gives the radius/elevation/
   typography rationale this port follows.
3. **`apps/client-web/src/app/globals.css`** (5 lines) — confirms
   client-web does not duplicate the palette; it `@import`s
   `packages/design-system/src/globals.css` by relative path, with a
   comment explaining why (Tailwind v4 content-detection doesn't walk out
   to the sibling package, so `@source` directives live in the shared
   package's own stylesheet instead).

## The exact real color values ported

From `packages/design-system/src/globals.css` lines 22–115, copied
verbatim (not re-sampled, not approximated):

| Token | 500 (base) | Other stops used |
|---|---|---|
| `--color-brand-purple-*` | `#7a1783` | 100 `#ecdfee`, 300 `#ba86bf`, 700 `#56125d`, 900 `#320d37` |
| `--color-brand-magenta-*` | `#c4006e` | 100 `#f7dbeb`, 300 `#e07ab4`, 700 `#88034f`, 900 `#4d052f` |
| `--color-brand-blue-*` | `#1f86c8` | 50 `#f2f8fc`, 100 `#e0eef7`, 300 `#8bc0e2`, 400 `#55a3d5`, 700 `#185e8c`, 800 `#154a6e`, 900 `#123550` |
| `--color-brand-orange-*` | `#f07800` | 50 `#fef7f0`, 100 `#fdecdb`, 400 `#f4983d`, 700 `#a65404`, 800 `#824206` |
| `--color-brand-neutral-*` | — | 100 `#f0f0f2`, 200 `#e1e1e6`, 300 `#c7c7cf`, 400 `#9a9aa6`, 600 `#5c5c68`, 800 `#2c2c34`, 900 `#18181d` |
| `--color-semantic-success-*` | `#059669` | 50 `#ecfdf5`, 700 `#047857` |
| `--color-semantic-warning-*` | = brand-orange-500 | reuses the orange scale (globals.css line 83–85: `var(--color-brand-orange-*)`) |
| `--color-semantic-danger-*` | `#dc2626` | 50 `#fef2f2`, 700 `#b91c1c` |
| `--color-semantic-info-*` | = brand-blue-500 | reuses the blue scale (globals.css line 89–91: `var(--color-brand-blue-*)`) |
| `--radius-card` | `1.375rem` (22px) | |
| `--radius-control` | `0.875rem` (14px) | |
| `--radius-pill` | `9999px` | |
| `--motion-fast` / `--motion-normal` / `--motion-slow` | `120ms` / `220ms` / `360ms` | |
| `--shadow-brand` | `0 18px 55px rgba(66, 25, 70, 0.12)` | |

## Confirmed gap and what was fixed

`apps/mobile/lib/core/theme/app_theme.dart` was a confirmed placeholder.
Before this change it read:

```dart
static const _seed = Color(0xFF5B3A8E);
// ...
colorScheme: ColorScheme.fromSeed(seedColor: _seed, brightness: ...)
```

with a comment literally stating: *"Placeholder values... nothing
downstream should hardcode a color or text style outside this file."*

`0xFF5B3A8E` is **not** a real ABIES token — it does not appear anywhere
in `globals.css`, and it is visibly a different, bluer/lighter purple than
the real `brand-purple-500` (`#7a1783`). Flutter's
`ColorScheme.fromSeed` also algorithmically generates every other role
(secondary, tertiary, surfaces, etc.) from that one seed via Material
You's tonal-palette algorithm — meaning none of the website's real
magenta/blue/orange hues, radius tokens, or motion tokens were present
anywhere in the mobile app's theme.

**Fix applied**: `app_theme.dart` was rewritten to build
`ColorScheme.light()`/`ColorScheme.dark()` manually, field by field, from
the literal hex values above — no `fromSeed`, no algorithmic
approximation. Radius tokens are ported as `AppRadius.card`/`.control`/
`.pill` and wired into `CardThemeData`/button themes/
`InputDecorationThemeData`/`ChipThemeData`. Motion tokens are ported as
`AppMotion.fast`/`.normal`/`.slow` (`Duration` constants) since nothing in
`apps/mobile/lib` defined named motion durations before. Semantic
success/warning/danger/info are exposed via a `ThemeExtension`
(`AppSemanticColors`), since Flutter's `ColorScheme` has no built-in
success/warning/info roles. Full reasoning for which brand color maps to
which Flutter `ColorScheme` role is documented inline in
`app_theme.dart`'s comments, not left implicit — see
`docs/mobile-design-system.md` for the summarized mapping table.

## Verification performed

- `flutter analyze` in `apps/mobile/`: **0 issues** (`No issues found!`),
  both before and after this change.
- `flutter build apk --debug --flavor dev --dart-define=ABIES_ENV=dev -t lib/main_dev.dart`:
  **exit code 0**, produced `build/app/outputs/flutter-apk/app-dev-debug.apk`.
  This proves the new theme compiles and the app assembles successfully
  with it; see `docs/mobile-design-system.md` for what wasn't
  independently re-verified (no emulator/device render was performed in
  this session — the brief's acceptance bar was the build, which passed).

## What this audit did NOT find

Grepping all of `apps/mobile/lib/` for `Color(0x...)` literals outside
`app_theme.dart` (both before and after this change) found **zero**
matches — see `docs/mobile-design-system.md` §"Hardcoded-color audit"
for the full grep output and the one related finding that IS real
(`Colors.green`/`Colors.orange`/`Colors.red` named constants in
`connection_diagnostics_screen.dart`, which bypass the theme by a
different route than a `Color(0x...)` literal).
