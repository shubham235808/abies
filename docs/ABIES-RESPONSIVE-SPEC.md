# ABIES Responsive Spec

Companion to `docs/ABIES-DESIGN-SYSTEM.md`, required before any "4D
immersive" visual work begins (brief §123, §68, §109, §112). Extends
`docs/UX-12-QA-REPORT.md`'s already-proven three-viewport methodology
(desktop 1440×900, tablet 768×1024, mobile 390×844) rather than replacing
it — that methodology is real, already run once across all 58 pages, and
stays the verification process; this document adds the 375px width the
brief names explicitly and formalizes per-portal *strategy*, not just
verification widths.

## 1. Breakpoints

```
375px   — minimum supported width (brief §68/§81), not separately designed for beyond confirming no horizontal scroll/clipped content
390px   — primary mobile design target (matches the device this session's own screenshots use)
768px   — tablet
1024px  — small desktop / large tablet landscape
1440px+ — primary desktop design target
```

These match Tailwind's default breakpoint scale (`sm`/`md`/`lg`/`xl`)
already in use throughout every rebuilt portal page — no new breakpoint
system needed, just the explicit 375px floor added to the verification
matrix.

## 2. Per-portal strategy (backs §68, §109 — "mobile requires its own
interaction strategy, not a shrunk desktop")

**Public website + Patient Portal — mobile-first**: designed at 390px
first, then enhanced upward. Patient-specific mobile pattern (§109): sticky
contextual primary action (e.g. "Book" stays reachable while scrolling a
long doctor-profile page), swipe-friendly horizontal card rows for
discovery sections (Panchakarma Near You, Diagnostics Near You) rather than
a single-column stack when there are more than 3 items, bottom-anchored
quick actions considered for the dashboard's 4 primary tasks (§99) *if* it
doesn't collide with the existing `MobileNav` dropdown — evaluate during
build, don't commit to bottom-tab navigation replacing the current
hamburger pattern here.

**Doctor Portal — tablet+desktop primary, mobile fully usable**: matches
`docs/TARGET-ARCHITECTURE.md`'s original responsive-breakpoints intent,
restated here since it still holds — a doctor reviewing a consultation is
more likely on a tablet/desktop between patients than on a phone, but
nothing (documents, consultation workspace, prescriptions) may be
mobile-broken; UX-12 already verified this at 390px with no defects found.

**All other operational portals (Admin, Lab, Pharmacy, Panchakarma Centre,
Customer/Technical Support, Sales, Care Coordinator) — desktop-first, fully
usable on tablet/mobile for essential operations**: unchanged from
`docs/TARGET-ARCHITECTURE.md`'s existing principle, already how UX-1..12
built every one of these (sidebar collapses to `MobileNav` dropdown below
`md`, `MetricCard` grids reflow to single column, Kanban/table content
scrolls horizontally in its own contained region rather than breaking page
layout — confirmed correct in `docs/UX-12-QA-REPORT.md`'s mobile
screenshots of the Sales Kanban board specifically).

**Pharmacy POS (§104, net new)** — desktop/tablet-optimized specifically,
not mobile-first: a counter-sale screen is used on fixed hardware at a
till, not a phone; build it responsive down to tablet width only, don't
over-invest in a 390px POS layout that will never be used that way in
practice.

## 3. Touch targets

Minimum 44×44px hit area for any interactive element on a touch-capable
viewport (WCAG 2.5.5, AA-adjacent) — `Button`'s existing `md` size
(`px-4 py-2.5`) already clears this comfortably; `sm` buttons and icon-only
controls (once icons exist, per `docs/ABIES-DESIGN-SYSTEM.md` §6) need an
explicit minimum touch-area check during ENTERPRISE-1's component build,
not left to visual judgment alone.

## 4. Skeleton loading (§112)

No skeleton pattern exists today (every current loading state is either
instant — Server Components fetch before rendering — or, for the rare
client-side wait, no explicit skeleton at all). Spec for when
ENTERPRISE-1's components need one (client-side data fetches, not
server-rendered initial loads, which don't need a skeleton at all since
there's no flash of empty content):

| Context | Skeleton shape |
|---|---|
| Doctor/therapy/medicine card grid | Card-shaped grey blocks matching the real card's aspect ratio, `skeleton-pulse` motion (`docs/ABIES-MOTION-SYSTEM.md` §3) |
| `MetricCard` grid | Same card shell, number replaced with a short pulsing bar |
| `DataTable` (once built) | 5-8 pulsing row placeholders matching real column widths, not a generic centered spinner |
| Single detail page | Skeleton matching that page's actual heading/body block structure |

One generic full-page spinner is explicitly the thing being replaced here
(§112) — but note most of this app doesn't need this at all today, since
Server Components already fetch data before the page renders; skeletons
only matter for the client-side interactive pieces this brief adds (POS,
promotion manager, configuration UI, global search-as-you-type).

## 5. Layout-shift discipline (backs §107's CLS budget)

Every image (doctor photo, therapy image, promotion banner) must declare
its aspect ratio via `next/image`'s `width`/`height` (or `fill` inside a
sized container) so it never causes layout shift once it loads — already
the correct pattern for the 8 existing medicine product photos, extend it
to every new image surface rather than introducing a second, laxer
convention.

## 6. Verification process (extends `docs/UX-12-QA-REPORT.md`, doesn't replace it)

Every major screen touched by a later ENTERPRISE stage gets screenshotted
at all four widths (375/390/768/1440, adding 375px to the three already
used) before that stage is called done — same Playwright-script-per-run
methodology already proven across 174 screenshots in UX-12, reused as-is.
`docs/ABIES-VISUAL-QA-CHECKLIST.md` is the literal per-screen checklist run
against those screenshots.
