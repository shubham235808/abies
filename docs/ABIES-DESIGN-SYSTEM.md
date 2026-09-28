# ABIES Design System

Foundational document required before any "4D immersive" visual work begins
(brief §123). Defines the token system, component specs, and design
principles every later visual stage must build against. Grounded in what
`src/app/globals.css` and the existing `src/components/ui/*` actually
define today (read in full for this document) — extended, not replaced,
following the same discipline `docs/PORTAL-UX-SPEC.md`'s Enterprise-0
addendum already used. Companion documents: `docs/ABIES-MOTION-SYSTEM.md`
(motion tokens/rules), `docs/ABIES-RESPONSIVE-SPEC.md` (breakpoints/layout
strategy per portal), `docs/ABIES-VISUAL-QA-CHECKLIST.md` (the gate every
screen must pass before being called done).

## 1. Color tokens

### 1.1 Brand scales (existing, unchanged)

`src/app/globals.css` already defines a real, sampled-from-the-actual-logo
50–900 scale for four brand hues plus neutral — this is correct and stays
exactly as-is:

```
--color-brand-purple-{50..900}    (#7a1783 at 500)
--color-brand-magenta-{50..900}   (#c4006e at 500)
--color-brand-blue-{50..900}      (#1f86c8 at 500)
--color-brand-orange-{50..900}    (#f07800 at 500)
--color-brand-neutral-{50,100,200,300,400,600,800,900}
```

### 1.2 Semantic tokens (NEW — genuine gap)

Confirmed absent today: `badge.tsx`'s `success`/`danger` tones currently
fall back to raw Tailwind `emerald`/`red`, not a brand-derived token, and
there is no `warning` or `information` tone at all (`Tone` type only has
`success`/`danger` beyond the four brand hues). Add:

```css
--color-semantic-success-50:  #ecfdf5;   /* derived from emerald, kept close to existing usage */
--color-semantic-success-500: #059669;
--color-semantic-success-700: #047857;

--color-semantic-warning-50:  #fef7f0;   /* reuse brand-orange scale — orange already reads as "attention" in this palette, e.g. UNDER_REVIEW badges */
--color-semantic-warning-500: var(--color-brand-orange-500);
--color-semantic-warning-700: var(--color-brand-orange-700);

--color-semantic-danger-50:   #fef2f2;
--color-semantic-danger-500:  #dc2626;
--color-semantic-danger-700:  #b91c1c;

--color-semantic-info-50:     var(--color-brand-blue-50);
--color-semantic-info-500:    var(--color-brand-blue-500);
--color-semantic-info-700:    var(--color-brand-blue-700);
```

Warning and Info deliberately reuse the existing brand orange/blue scales
rather than inventing new hues — orange already functions as "needs
attention" throughout the app (`UNDER_REVIEW`, `P2` priority badges), and
blue already reads as informational/neutral-positive (`SUBMITTED`,
`RESCHEDULED`). Success/Danger get their own scale since neither brand hue
reads as "positive"/"negative" on its own (magenta is the primary brand
color, not a danger signal). `badge.tsx`'s `TONE_CLASSES` map updates to
reference these instead of raw `emerald-*`/`red-*` utility classes — a
one-file change, not a rewrite of every call site (Badge's callers pass a
`tone` string, not a color literal).

### 1.3 Surface tokens (NEW — backs the depth system, §89)

```css
--color-surface-page:      var(--color-brand-neutral-50);   /* = existing body background, unchanged */
--color-surface-1:         #ffffff;                          /* = existing Card background, unchanged */
--color-surface-2:         #ffffff;                          /* elevated card — same white, differentiated by shadow token, not color, to avoid a muddy grey-on-grey stack */
--color-surface-overlay:   rgba(24, 24, 29, 0.48);            /* modal/drawer scrim — derived from brand-neutral-900 */
--color-border-default:    var(--color-brand-neutral-200);   /* = existing Card border, unchanged */
--color-border-strong:     var(--color-brand-neutral-300);
--color-text-muted:        var(--color-brand-neutral-600);   /* = existing CardDescription color, unchanged */
```

### 1.4 Gradient tokens (NEW — backs §87/§88)

Named, not arbitrary — used **selectively** per §87's explicit instruction
("do NOT make every card or button gradient-based"), scoped to the specific
places named in this document and the motion/responsive specs (hero
sections, promotion cards, the Patient Portal's premium areas), never
applied to operational-portal chrome (tables, forms, POS — see §3 below).

```css
--gradient-purple-magenta: linear-gradient(135deg, var(--color-brand-purple-500), var(--color-brand-magenta-500));
--gradient-blue-purple:    linear-gradient(135deg, var(--color-brand-blue-500), var(--color-brand-purple-500));
--gradient-orange-magenta: linear-gradient(135deg, var(--color-brand-orange-500), var(--color-brand-magenta-500));
```

## 2. Typography

No dedicated type-scale tokens exist today — text sizing is ad hoc Tailwind
utility classes per component (`text-2xl font-semibold` for page titles,
`text-sm` for body/labels, `text-xs` for meta text — confirmed consistent
across every portal page read this session). Formalize what's already in
consistent use rather than introducing a new scale:

| Token | Tailwind class | Current usage |
|---|---|---|
| `display` | `text-3xl font-semibold` | NEW — reserved for the public homepage hero only (§88) |
| `heading-1` | `text-2xl font-semibold` | Page titles (`<h1>` on every portal dashboard today) |
| `heading-2` | `text-lg font-semibold` | Card/section titles (`CardTitle`'s existing class) |
| `body` | `text-sm` | Default body text, form labels |
| `caption` | `text-xs` | Meta text, timestamps, badge labels |

Font family: system font stack (no webfont loaded today — confirmed no
`@font-face`/Google Fonts import in `globals.css`). Keep it — a system
stack is fast, accessible by default, and already reads as clean/premium
rather than generic (the "avoid Ayurveda clichés, feel modern/enterprise"
brief goal doesn't require a custom typeface). Do not add a webfont without
a specific, evaluated reason (performance budget, §107).

## 3. Elevation / depth system (NEW — backs §89)

Today: exactly one shadow level exists (`shadow-sm` on `Card`, confirmed in
`card.tsx`). The brief wants six. Define:

| Level | Token | Shadow | Used for |
|---|---|---|---|
| 0 | `--elevation-0` | none | Page background |
| 1 | `--elevation-1` | `shadow-sm` (existing) | Section surfaces, standard `Card` — unchanged |
| 2 | `--elevation-2` | `shadow-md` | Interactive/hoverable cards (doctor cards, service cards) |
| 3 | `--elevation-3` | `shadow-lg` | Elevated/featured cards (promotion spotlights, the patient dashboard's "Next appointment" hero card — already visually distinguished today via a tint border, gains a real elevation bump) |
| 4 | `--elevation-4` | `shadow-xl` | Floating contextual elements (sticky booking panel, floating action) |
| 5 | `--elevation-5` | `shadow-2xl` | Modals/drawers/dialogs (none exist yet — ENTERPRISE-1 builds the first ones) |

All five map directly to Tailwind's existing `shadow-{sm,md,lg,xl,2xl}`
utilities — no custom box-shadow values needed, keeping this cheap to apply
consistently. Elevation increases on hover/focus for interactive elements
by exactly one level (e.g. a Level 2 doctor card becomes Level 3 on hover),
never more — a card that jumps from `shadow-sm` to `shadow-2xl` on hover
reads as a bug, not "premium."

## 4. Radius

Existing: `--radius-card: 0.75rem` (used everywhere via `rounded-card`).
Keep it as the default for cards/panels. Add two more, both already in de
facto use as raw Tailwind utilities (`rounded-lg` on buttons/inputs,
`rounded-full` on badges/pills) — name them so they're a deliberate choice
going forward, not an accident of whichever utility a component happened to
use:

```css
--radius-control: 0.5rem;   /* = rounded-lg, existing Button/Input radius, unchanged */
--radius-pill:    9999px;   /* = rounded-full, existing Badge/Tabs radius, unchanged */
--radius-card:    0.75rem;  /* existing, unchanged */
```

## 5. Spacing & grid

No dedicated spacing scale — Tailwind's default scale (4px base unit) is
already used consistently (`p-6` on cards, `gap-4`/`gap-6` on grids,
`px-4 py-2.5` on buttons) and should stay the default rather than
introducing a second, competing scale. Grid: portal content areas use
Tailwind's `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`-style responsive
grids already, consistently, across every dashboard rebuilt in UX-1..12 —
this is already the house standard, not a gap. Formalize the container
width: dashboard content areas are unconstrained-width today (fill the
`PortalShell` content column); the public marketing site should adopt a
`max-w-7xl mx-auto px-4` container for readability at very wide viewports,
since immersive hero sections (§88) specifically need a controlled max
width to avoid an oversized, sparse layout on large monitors.

## 6. Component specs

### Buttons
Existing 4 variants (`primary`/`secondary`/`ghost`/`danger`) and 2 sizes
(`sm`/`md`) are sufficient — confirmed by direct read of `button.tsx`, no
gap here. Add a `lg` size (`px-6 py-3 text-base`) reserved for the public
homepage's primary hero CTA only (§88) — operational portals never need a
button larger than `md`.

### Cards
Existing `Card`/`CardHeader`/`CardTitle`/`CardDescription` stay as the base.
Add an `elevated` prop mapping to the Level-2/3 shadow tokens from §3, and
an `interactive` prop adding `transition-shadow hover:shadow-md cursor-pointer`
(cross-ref `docs/ABIES-MOTION-SYSTEM.md` for the transition duration) — for
doctor/therapy/medicine/promotion cards specifically, never for operational
list rows (those already correctly use the flatter `ListRow` component,
which should **not** gain hover-elevation — a 40-row order list with every
row lifting on hover is noise, not premium).

### Forms
`Input`/`Textarea`/`Select`/`Label`/`FieldError` are already consistent and
accessible (confirmed `focus:outline` pattern in `input.tsx`) — no redesign
needed structurally. Visual refresh (if any) stays within the existing
focus-ring/border-color tokens, not a new form-control system.

### Tables
No `DataTable` component exists yet (confirmed,
`docs/ENTERPRISE-CURRENT-STATE.md` §5) — `docs/ENTERPRISE-IMPLEMENTATION-PLAN.md`'s
ENTERPRISE-1 already scopes building it. Spec for that build: Level-1
elevation, sticky header on scroll, row hover uses `--color-surface-page`
tint (not a shadow — a table row lifting on hover reads as broken, not
premium, per §103's "operational portals prioritize speed" rule), zebra
striping optional per-table not global default.

### Navigation
`PortalShell` (sidebar desktop / `MobileNav` dropdown mobile) is
correct and stays. Public site nav (`SiteHeader`) gains a scroll-aware
elevation change (transparent-over-hero → Level-1 surface once scrolled
past the hero) for the immersive homepage specifically (§88/§91) — every
other page's header stays flat/static, no scroll effect, since only the
homepage has a hero worth floating over.

### Icons
No icon library is currently installed (confirmed: every "icon" in the app
today is either an emoji-free text label or the one inline `<svg>` spinner
in `button.tsx`). Adding one is **NEW** — recommend Lucide (tree-shakeable,
matches a clean/enterprise-not-cartoonish aesthetic) over anything
illustration-heavy; scope and pick during ENTERPRISE-1, not decided
unilaterally here since it's a real dependency addition.

### Images
`next/image` is already the pattern for the 8 real medicine product photos
(Phase-adjacent work, `public/medicines/`) and should be the pattern for
every new image surface this brief adds (doctor photos, therapy/centre
photos, promotion banners) — responsive `sizes`, lazy loading by default,
never a raw `<img>` tag. Per §111: real ABIES provider/product images only,
no stock photography substituted for a real doctor/centre/product record.

## 7. Status colors

Every domain status enum already maps to a `Tone` in `badge.tsx`
(`VERIFICATION_TONE`, `APPOINTMENT_STATUS_TONE`, and similar per-domain
maps) — this pattern is correct and already centralizes what §74 asks for
("centralize status definitions, don't scatter Pending/PENDING/pending
throughout the frontend"). The only change needed is swapping `success`/
`danger`'s underlying colors from raw Tailwind to the new semantic tokens
(§1.2) — the mapping structure itself is unchanged.

## 8. Motion, responsive, accessibility — summary (full spec in companion docs)

- **Motion**: see `docs/ABIES-MOTION-SYSTEM.md` for durations, transition
  patterns, and the per-portal motion-intensity policy (public/patient richer,
  operational portals restrained, per §103).
- **Responsive**: see `docs/ABIES-RESPONSIVE-SPEC.md` for breakpoints and
  per-portal layout strategy.
- **Accessibility**: WCAG AA remains the target (unchanged from
  `docs/TARGET-ARCHITECTURE.md`'s original design-system section). Every
  new token/component in this document must keep the existing
  `focus-visible` pattern (confirmed real in `button.tsx`/`input.tsx`, not
  aspirational) and pass the contrast check in
  `docs/ABIES-VISUAL-QA-CHECKLIST.md`. Gradient text/backgrounds (§1.4)
  are restricted to large decorative surfaces (hero backgrounds, promotion
  banners) specifically because gradient-behind-text is a common contrast
  failure mode — body text and clinical/operational content never sits
  directly on a gradient.

## 9. What this document deliberately does not do

It does not redesign any existing component's visual output today — every
token above either names something already in use (making it deliberate
rather than accidental) or adds a genuinely new, additive token (semantic
colors, elevation scale, gradients) that no existing page yet references.
No CSS or component file changes ship with this document — per §123, the
portal redesign begins only after this, `docs/ABIES-MOTION-SYSTEM.md`,
`docs/ABIES-RESPONSIVE-SPEC.md`, and `docs/ABIES-VISUAL-QA-CHECKLIST.md` are
all in place and reviewed.
