# pharmacy

Implemented in Phase 7 of `docs/mobile/IMPLEMENTATION-PLAN.md`: medicine catalogue search, medicine/pharmacy
detail, the multi-cart flow (one active cart per pharmacy — EXPANSION-1b), checkout, and medicine order
management (list, detail, cancel, review). Prescription discovery and the "purchase from a finalized
prescription" flow live in the sibling `lib/features/prescriptions/` feature — see its own `PHASE.md`.

## Endpoints consumed

- `GET /api/v1/public/medicines` + `/facets` — OTC-only catalogue search (`publicMedicineSearchSchema`'s
  `q`, `area`, `category`, `brand`, `isFmcg`, `priceMin`/`priceMax`).
- `GET /api/v1/public/medicines/[id]/reviews` — real, id-keyed, fetched from the medicine detail screen.
- `GET /api/v1/public/pharmacies?area=` — the pharmacy-picker list (used here for a medicine's embedded
  pharmacy detail; used by `lib/features/prescriptions/` for the purchase-from-prescription pharmacy pick).
- `GET /api/v1/patients/me/cart` — `{ carts }` (plural, `listMyCarts()`), `POST` (add), `PATCH`/`DELETE
  .../cart/items/[id]` (update/remove), `POST .../cart/[id]/checkout`.
- `GET /api/v1/medicine-orders/mine`, `/[id]`, `POST /[id]/cancel`, `/[id]/review`,
  `POST /medicine-orders/verify-payment`.

## Known gap — no single-item detail route (same pattern as Panchakarma/Diagnostics)

There is no `GET /public/medicines/[id]` and no `GET /public/pharmacies/[id]` (confirmed by reading every
route under `.../api/v1/public/medicines*` and `.../api/v1/public/pharmacies*`). `MedicineDetailScreen` and
`PharmacyDetailScreen` take their object via `GoRouter` `extra` — the exact object the catalogue search (or
a medicine's embedded `pharmacy` field) already fetched — never a re-fetch-by-id. Opened cold (no `extra`),
each shows an honest "start from the catalogue" state. Same for `CheckoutScreen`: there is no single-cart
`GET` either (only the plural `/patients/me/cart`), so it takes its `Cart` via `extra` from `CartScreen`,
and `CheckoutFlowController.confirmCheckout` re-fetches *every* cart via `PharmacyApi.myCarts()` and matches
by id to re-verify availability immediately before checkout, rather than trusting that `extra`.

**Suggested backend follow-up**: a `GET /api/v1/public/medicines/[id]` (returning every pharmacy that
stocks it, or the specific pharmacy+medicine row by a composite key) and a `GET /api/v1/public/
pharmacies/[id]` would let these screens be real cold deep links, same follow-up already on file for
Panchakarma/Diagnostics.

## Two genuinely separate purchase paths — read from the real code, not assumed

- **Cart checkout** (`POST /patients/me/cart/[id]/checkout` → `checkoutCart()` → delegates to `bookOrder()`
  with no `prescriptionId`) — the path for **OTC items only**. `addToCart()` itself refuses any
  `requiresPrescription` medicine with a 400 ("order it from a finalized prescription instead of the
  cart") — this app never attempts to add one to a cart, and never duplicates that rule as its own
  client-side gate; the backend's own checkout/add-to-cart response is authoritative (brief §10).
- **Direct order booking** (`POST /api/v1/medicine-orders` → `bookOrder()` directly) — confirmed
  patient-reachable (`requireRole(ctx, 'PATIENT')` on that route, read directly, not assumed) and
  genuinely callable from a patient session. **This is the only path for a prescription-gated item** —
  used exclusively by `lib/features/prescriptions/`'s "purchase from a finalized prescription" flow
  (pick a pharmacy → `matchPrescriptionAtPharmacy` → pick quantities → `bookOrder` with `prescriptionId`
  + the matched items). This is a real, worth-flagging finding: the brief's own phrasing guessed the
  matched items would be "added to cart… one per matched item," but `addToCart()` would reject every one
  of them (they're all `requiresPrescription` by definition) — the actual, working path is this direct
  route, not the cart.

## Payment

Same `isConfigured()` / 503-as-`ServiceUnavailableError` handling every prior phase established.
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are blank in this dev environment, so every real checkout/book
attempt here returns a calm "not available in this environment yet" state (`CheckoutOutcomeKind.
serviceUnavailable` / `PurchaseOutcomeKind.serviceUnavailable`), never a crash. The full success-path
plumbing (`MedicineOrderCreationResult`, `/verify-payment`) is implemented and unit-tested against a fake,
with no real Razorpay Flutter SDK call behind it — an explicit Phase 8 dependency, same as every prior
phase's booking flow.

## Re-fetch-before-commit discipline

`CheckoutFlowController.confirmCheckout` re-fetches every active cart (`myCarts()`) immediately before
calling `/checkout`, and refuses to proceed if the chosen cart is gone, empty, or has any item the fresh
fetch now reports `available: false` (a live stock/price check `getCart()`/`listMyCarts()` already expose
per item — see `CartItem`'s doc comment) — same spirit as every prior phase's "never trust a screen's
earlier fetch at the moment of payment" rule, adapted here to a multi-item cart's own re-checkable
availability field rather than a single slot/therapy/test's existence.
