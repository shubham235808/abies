# ABIES Visual QA Checklist

The quality gate required by brief §119-121: "a page is NOT accepted simply
because functionality works." Companion to `docs/ABIES-DESIGN-SYSTEM.md`,
`docs/ABIES-MOTION-SYSTEM.md`, and `docs/ABIES-RESPONSIVE-SPEC.md` — this
document is the literal checklist run against every major screen a later
ENTERPRISE stage touches, extending (not replacing)
`docs/UX-12-QA-REPORT.md`'s already-proven screenshot methodology.

## How to run this

1. Capture screenshots at 375 / 390 / 768 / 1440 px (`docs/ABIES-RESPONSIVE-SPEC.md`
   §6) using the same throwaway-Playwright-spec-in-`tests/e2e/`, run, delete
   pattern already established across every phase and UX-12.
2. Walk every screen through the eight categories below, in order.
3. Record findings honestly — per §76-77's no-fake-data discipline, a
   checklist item that wasn't actually checked is not marked passed.
4. A screen with an open **Functional** or **Accessibility** finding does
   not ship; a screen with an open **Visual** finding ships only with the
   finding explicitly logged as a remaining gap in that stage's report
   (brief §84 format), never silently.

## 1. Functional quality

- [ ] Every displayed number/status is real data, not a placeholder left
      in during layout work (§76 — the single most load-bearing check in
      this whole list, given this app's standing discipline).
- [ ] Every `MetricCard`/summary tile that implies "click to see the
      filtered list" actually links there, correctly filtered (§63's "not
      decorative dead ends" rule).
- [ ] Empty states use `EmptyState` (or the new pattern for a screen type
      it doesn't cover yet) with a specific, honest message — never a bare
      "No data" and never a fabricated non-zero placeholder (§77).
- [ ] Error states use the app's existing honest-failure pattern (the
      "payments not configured" / `ServiceUnavailableError` precedent) —
      never a fake success state papering over a real failure.

## 2. Visual quality

- [ ] Uses only tokens from `docs/ABIES-DESIGN-SYSTEM.md` — no ad hoc hex
      value, no raw Tailwind color utility bypassing the brand/semantic
      scale, no shadow value outside the six elevation levels.
- [ ] Gradients (if any) are one of the three named tokens, used
      selectively per §87 — flag if more than one gradient surface appears
      per screen, since that's the specific overuse §87 warns against.
- [ ] Card/button/badge styling is visually consistent with the same
      component elsewhere in the app — no one-off variant invented for a
      single screen.
- [ ] Spacing/alignment reads as intentional (Tailwind's default scale,
      per `docs/ABIES-DESIGN-SYSTEM.md` §5) — no visually-arbitrary gaps.
- [ ] Images use real ABIES content where a real record exists (doctor/
      centre/product), never a stock-photo substitute for one (§111).

## 3. Responsive quality

- [ ] No horizontal page-level scroll at any of the four widths, except
      the specific components designed to scroll horizontally on purpose
      (Kanban board, `DataTable` on narrow viewports) — each in its own
      contained `overflow-x-auto` region, per the established pattern.
- [ ] Touch targets ≥44×44px on the 375/390 captures
      (`docs/ABIES-RESPONSIVE-SPEC.md` §3).
- [ ] The portal's assigned strategy is followed — mobile-first richness
      for Public/Patient, desktop-first-but-usable for every operational
      portal, POS is desktop/tablet-only (`docs/ABIES-RESPONSIVE-SPEC.md` §2)
      — a mobile-first treatment on an operational portal is itself a
      finding, not a bonus.
- [ ] No layout shift from an image without a declared aspect ratio
      (`docs/ABIES-RESPONSIVE-SPEC.md` §5).

## 4. Accessibility

- [ ] Every interactive element has a visible focus state (the existing
      `focus-visible:outline` pattern, confirmed real in `button.tsx`/
      `input.tsx` — new components must match it, not silently drop it in
      pursuit of a cleaner look).
- [ ] Every form input has an associated `<Label htmlFor>` (existing
      convention, `input.tsx`) — no new unlabeled input introduced.
- [ ] Color contrast meets WCAG AA for text against its background,
      including text over any gradient surface (§1.4's specific risk —
      check this explicitly wherever a gradient token is used).
- [ ] Works correctly with `prefers-reduced-motion: reduce` set
      (`docs/ABIES-MOTION-SYSTEM.md` §6) — nothing becomes unreadable or
      non-functional with animation disabled.
- [ ] Keyboard-only pass: can reach and operate every action on the screen
      without a mouse (this is the one item UX-12's lighter spot-check
      explicitly deferred — `docs/UX-12-QA-REPORT.md`'s accessibility
      section — and must be a real pass here, not skipped again).

## 5. Performance

- [ ] No new client-side dependency added without a stated reason
      (§107 — "avoid massive animation libraries unless justified";
      `docs/ABIES-MOTION-SYSTEM.md` §8 already commits to zero new runtime
      dependency for motion specifically).
- [ ] Images are `next/image`, responsive `sizes`, lazy-loaded below the
      fold.
- [ ] No scroll-triggered animation runs outside the "Rich tier" portals
      (`docs/ABIES-MOTION-SYSTEM.md` §4) — an operational-portal page
      animating on scroll is itself a finding.
- [ ] Core Web Vitals spot-check (Lighthouse or equivalent, real
      measurement, not assumed): LCP, CLS, INP within acceptable range for
      the page's content weight — record the actual numbers in that
      stage's report, not a pass/fail assertion alone.

## 6. Data accuracy

- [ ] Every field shown traces to a real Prisma model field cited in
      `docs/ENTERPRISE-DATA-MODEL-CHANGES.md` or the existing schema — no
      field invented at the UI layer with nothing backing it.
- [ ] Status badges use the centralized tone-mapping pattern
      (`docs/ABIES-DESIGN-SYSTEM.md` §7), not a one-off color decision per
      screen.

## 7. Role relevance

- [ ] The screen answers its portal's governing question from
      `docs/PORTAL-UX-SPEC.md` ("what does this person need to accomplish
      when they log in today") — not a generic template with this role's
      label swapped in (the exact failure `docs/UI-UX-AUDIT.md` Finding 1
      already found and UX-1..12 already fixed; don't reintroduce it while
      adding visual polish).
- [ ] Least-privilege data exposure holds (`docs/ENTERPRISE-GAP-ANALYSIS.md`
      §71) — a visual redesign never becomes an excuse to surface a field
      that role shouldn't see (e.g. clinical notes leaking into a Support-
      facing card layout because it "looked good together").

## 8. Design consistency

- [ ] Motion matches the screen's assigned tier and uses only named
      patterns from `docs/ABIES-MOTION-SYSTEM.md` §3 — no bespoke
      animation invented for one screen.
- [ ] Elevation level matches the component's role
      (`docs/ABIES-DESIGN-SYSTEM.md` §3) — a static list row is never at
      Level 3, a featured/hero card is never left at Level 1.
- [ ] Typography uses the named scale (§2 of the design system doc), not
      an arbitrary `text-*` size picked to make one heading "feel bigger."

## Sign-off

A screen passes this checklist when every box above is either checked or
has an explicitly logged, non-blocking exception recorded in that stage's
`docs/ENTERPRISE-IMPLEMENTATION-PLAN.md`-format report under **Problems
Found**/**Remaining Gaps** — never silently skipped. This mirrors exactly
how `docs/UX-12-QA-REPORT.md` reported its own two known gaps (the Sales
fixture's missing audit event, the ticket-button double-submit guard)
instead of declaring the redesign complete by default.
