# ABIES Motion System

Companion to `docs/ABIES-DESIGN-SYSTEM.md`, required before any "4D
immersive" visual work begins (brief §123, §90-92, §103, §108, §113,
§118). Defines the one central motion vocabulary every later stage must
use — per §90's explicit instruction not to scatter arbitrary animation
code per component.

## 1. Current state (grounded, not assumed)

Confirmed by reading `button.tsx`, `card.tsx`, and every portal page
rebuilt in UX-1..12: motion today is almost nonexistent — one
`animate-spin` loading indicator, `transition-colors` on buttons/links
(Tailwind's default ~150ms), nothing else. No duration tokens, no
easing tokens, no page-transition system, no scroll-triggered animation,
no reduced-motion handling exists anywhere in the codebase today. This is
not a deficiency to apologize for — a healthcare app with zero gratuitous
motion has correctly prioritized clarity so far. It is, however, a genuine
blank slate for this section, not an extension of existing patterns the way
`docs/ABIES-DESIGN-SYSTEM.md`'s color/elevation work was.

## 2. Duration tokens

```css
--motion-fast:   120ms;   /* hover states, button press, focus ring */
--motion-normal: 220ms;   /* card entry, tab switch, status-badge change */
--motion-slow:   360ms;   /* modal/drawer open, page-section reveal on scroll */
```

Three tiers only, deliberately — per §90's "do not scatter arbitrary
animation code," every transition in the app picks one of these three, never
a bespoke duration. Easing: `ease-out` for anything entering the screen
(feels responsive), `ease-in` for anything leaving, `ease-in-out` for a
value that changes in place (a metric updating, a progress step advancing).
All three are Tailwind's built-in easing curves — no custom cubic-bezier
needed.

## 3. Reusable transition patterns

One named pattern per interaction category from §90's list, each built from
the duration/easing tokens above — nothing here is a one-off:

| Pattern | Motion | Used for |
|---|---|---|
| `fade-in` | opacity 0→1, `--motion-normal`, ease-out | Page/section entry |
| `rise-in` | opacity 0→1 + translateY 8px→0, `--motion-normal`, ease-out | Card entry (staggered ~40ms per card in a grid, capped at 6 cards — never a long cascading delay on a 20-item list) |
| `lift` | elevation +1 level (see design system §3), `--motion-fast`, ease-out | Card hover/focus |
| `press` | scale 0.98, `--motion-fast` | Button/card active (press) state |
| `sheet-in` | translateY/X from edge + backdrop fade, `--motion-slow`, ease-out | Modal/Drawer opening (ENTERPRISE-1 builds the component; this is its motion spec) |
| `tab-switch` | underline/pill slides to new position, `--motion-normal`, ease-in-out | Tabs component (already exists — this is additive polish, not a rebuild) |
| `status-flip` | brief background-color pulse on the changed badge, `--motion-normal` | A status badge changing value (order dispatched, ticket resolved) — communicates *that something changed*, not just the new state |
| `success-check` | checkmark draw-in, `--motion-slow` | Payment success, document verified, report ready — the one place a slightly more expressive animation is earned, because it's a genuine milestone, not routine navigation |
| `skeleton-pulse` | opacity pulse loop, 1.5s | Loading states (spec in `docs/ABIES-RESPONSIVE-SPEC.md` §skeleton) |

## 4. Portal motion-intensity policy (backs §103)

Two tiers, not a blanket policy:

**Rich tier — Public site, Patient Portal**: all patterns in §3 available,
including scroll-triggered `rise-in` on the public homepage's service
cards/stats (§91) and the Patient dashboard's discovery sections. Scroll
effects are opacity/translate only (GPU-cheap, per §107) — never
scroll-jacking, never disabling native scroll, exactly per §91's explicit
constraint.

**Restrained tier — every operational portal** (Doctor, Lab, Pharmacy,
Panchakarma Centre, Customer Support, Technical Support, Sales, Care
Coordinator, Administrator): only `fade-in` (page entry), `lift` (hover),
`press`, `tab-switch`, `status-flip`, and `skeleton-pulse`. No `rise-in`
stagger, no scroll-triggered reveal, no `success-check` flourish beyond a
plain checkmark icon swap — per §103's own instruction, these portals
optimize for speed and repeated daily use, where the same animation seen
200 times a day becomes friction, not delight. The Pharmacy POS screen
specifically (§104) uses **only** `press` and `status-flip` — even
`lift`/hover-elevation is skipped there, since a POS is operated by
keyboard/scanner far more than mouse hover.

## 5. Governance rule (§118, applied literally)

Before any animation ships, it must answer yes to at least one:
*does it improve hierarchy, explain a state change, provide feedback,
improve navigation understanding, communicate progress, or enhance premium
brand perception without distraction?* If every answer is no, don't add it.
This is a review-time question for whoever builds each later stage, not
just a principle stated once here — `docs/ABIES-VISUAL-QA-CHECKLIST.md`
includes it as a literal checklist item.

## 6. Reduced motion (§108)

```css
@media (prefers-reduced-motion: reduce) {
  /* every pattern in §3 collapses to an instant state change — opacity/
     position/scale jump straight to the end value, no scroll-triggered
     reveal, no rise-in stagger. skeleton-pulse becomes a static skeleton
     (no pulse loop). This is a global override, applied once at the motion-
     utility level, not re-implemented per component. */
}
```

The app must be fully functional and fully readable with this preference
set — nothing here is decorative-load-bearing (no content that only
appears via a scroll animation and never otherwise renders).

## 7. Page transitions (§113)

No transition should ever delay a route change waiting for an animation —
per §113's explicit rule, if data is ready, render immediately. The only
transition applied to navigation itself is a `fade-in` (§3) on the new
page's content as it mounts, purely perceptual, never gating when the
browser actually navigates. Next.js's own streaming/Suspense boundaries
(already how every portal page fetches data server-side today) are the
real performance lever here, not client-side transition animation.

## 8. Implementation note (not yet built)

No animation library is installed today (confirmed: no `framer-motion`/
`motion`/similar in `package.json`, only plain Tailwind + CSS). Recommend
plain CSS transitions/`@keyframes` plus Tailwind's `transition-*`
utilities for everything in §3 except `rise-in`'s scroll-triggered stagger,
which needs a small `IntersectionObserver`-based utility hook — this is
enough to build every pattern above without adding a new runtime
dependency, consistent with §107's performance budget ("avoid massive
animation libraries unless justified"). Revisit only if a specific pattern
proves genuinely hard to build this way during ENTERPRISE-1.
