# Website ↔ Mobile Screen Mapping

Every file under `apps/mobile/lib/features/*/presentation/*.dart` as it
exists today, matched against its closest equivalent in
`apps/client-web/src/app/**`. Listed for real by reading the directory
tree (`find apps/mobile/lib/features -path "*/presentation/*.dart"`) and
cross-checked against `apps/mobile/lib/core/router/app_router.dart` for
each screen's route — nothing here is invented, and gaps are reported
honestly rather than forced.

Each `features/*/presentation/` directory also contains Riverpod
`*_controller.dart` files (state management, not UI). They're listed for
completeness since the glob in the brief matches them, but they have no
"screen" to map — they're the state layer behind the Screen rows below.

## Legend

- **Direct** — a dedicated website page/route exists for the same job.
- **Inline-equivalent** — the website does the same job, but as an
  expand-in-place widget inside a catalogue card (`HoverCard`) or a
  section within a larger dashboard page, not a separate route. Noted so
  no one assumes a 1:1 page exists when it doesn't.
- **No equivalent** — confirmed no close website analog exists (stated
  with why, not just asserted).

## Auth

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/auth/presentation/sign_in_screen.dart` | `/sign-in` | `apps/client-web/src/app/(auth)/login/page.tsx` | Direct |
| `features/auth/presentation/otp_screen.dart` | `/otp` | `apps/client-web/src/app/(auth)/login/mfa/page.tsx` | Direct |
| `features/auth/presentation/auth_controller.dart` | — | — | Controller, not a screen |

## Home

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/home/presentation/home_screen.dart` | `/` | `apps/client-web/src/app/patient/page.tsx` | Direct — both are the signed-in patient's personalized dashboard (appointments/diagnostics/medicine-order/panchakarma previews), not the public marketing homepage (`(public)/page.tsx`), which has no mobile equivalent screen at all today. |
| `features/home/presentation/home_controller.dart` | — | — | Controller, not a screen |

## Doctors

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/doctors/presentation/doctor_search_screen.dart` | `/doctors` | `apps/client-web/src/app/(public)/doctors/page.tsx` | Direct |
| `features/doctors/presentation/doctor_detail_screen.dart` | `/doctor/:slug` | `apps/client-web/src/app/(public)/doctors/[slug]/page.tsx` | Direct |
| `features/appointments/presentation/booking_screen.dart` | `/doctor/:slug/book` | `apps/client-web/src/app/(public)/doctors/[slug]/booking-widget.tsx` | Inline-equivalent — the web does booking as a widget embedded in the doctor profile page (`booking-widget.tsx`, imported by `[slug]/page.tsx`), not a separate route. Mobile gives it its own screen/route. |
| `features/doctors/presentation/doctor_detail_controller.dart`, `doctors_controller.dart` | — | — | Controllers, not screens |

## Appointments

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/appointments/presentation/appointment_list_screen.dart` | `/appointments` | `apps/client-web/src/app/patient/appointments/page.tsx` (+ `appointment-list.tsx`) | Direct |
| `features/appointments/presentation/appointments_controller.dart`, `booking_controller.dart` | — | — | Controllers, not screens |

Note: the web's appointment list links each row to
`/patient/consultations/[id]` (the consultation record), not to a
dedicated "appointment detail" page. Mobile's router has a matching
`/appointment/:id` route, but it resolves to an inline
`_PlaceholderScreen` defined directly in `app_router.dart` (not a file
under `presentation/`), so it's intentionally excluded from this table.

## Diagnostics

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/diagnostics/presentation/diagnostics_search_screen.dart` | `/diagnostics` | `apps/client-web/src/app/(public)/diagnostics/page.tsx` (+ `filters.tsx`) | Direct |
| `features/diagnostics/presentation/diagnostic_test_detail_screen.dart` | `/diagnostics/test/:id` | `apps/client-web/src/app/(public)/diagnostics/test-card.tsx` | Inline-equivalent — the web expands test detail in-place via a `HoverCard` on the catalogue card, no separate detail route. |
| `features/diagnostics/presentation/diagnostic_package_detail_screen.dart` | `/diagnostics/package/:id` | `apps/client-web/src/app/(public)/diagnostics/package-card.tsx` | Inline-equivalent, same pattern as test detail above. |
| `features/diagnostics/presentation/diagnostic_booking_screen.dart` | `/diagnostics/book` | `test-card.tsx`/`package-card.tsx`'s inline Razorpay checkout flow | Inline-equivalent — booking is part of the same expand-in-place card, not a separate page. |
| `features/diagnostics/presentation/diagnostic_order_list_screen.dart` | `/diagnostics/orders` | `apps/client-web/src/app/patient/diagnostics/page.tsx` (+ `order-list.tsx`) | Direct |
| `features/diagnostics/presentation/diagnostic_order_detail_screen.dart` | `/diagnostics/orders/:id` | — | No equivalent — `order-list.tsx` renders order/report status inline and links to nothing further (no `Link`/`href` in that file); the web has no dedicated per-order detail page to point at. |
| `features/diagnostics/presentation/diagnostic_recommendations_screen.dart` | `/diagnostics/recommendations` | `apps/client-web/src/app/patient/diagnostics/page.tsx` ("Recommended by your doctor" section) | Inline-equivalent — a section of the patient diagnostics dashboard, not its own page. |
| `features/diagnostics/presentation/*_controller.dart` (booking flow, orders, recommendations, report, search) | — | — | Controllers, not screens |

## Panchakarma

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/panchakarma/presentation/panchakarma_search_screen.dart` | `/panchakarma` | `apps/client-web/src/app/(public)/panchakarma/page.tsx` | Direct |
| `features/panchakarma/presentation/panchakarma_therapy_detail_screen.dart` | `/panchakarma/therapy/:id` | `apps/client-web/src/app/(public)/panchakarma/therapy-card.tsx` | Inline-equivalent — same `HoverCard` expand-in-place pattern as diagnostics above. |
| `features/panchakarma/presentation/panchakarma_booking_screen.dart` | `/panchakarma/book` | `therapy-card.tsx`'s inline Razorpay checkout flow | Inline-equivalent. |
| `features/panchakarma/presentation/panchakarma_booking_list_screen.dart` | `/panchakarma/bookings` | `apps/client-web/src/app/patient/panchakarma/page.tsx` (+ `booking-list.tsx`) | Direct |
| `features/panchakarma/presentation/panchakarma_booking_detail_screen.dart` | `/panchakarma/bookings/:id` | — | No equivalent — `booking-list.tsx` has no outbound `Link`/`href`; the web renders booking status inline on the dashboard with no per-booking detail page. |
| `features/panchakarma/presentation/panchakarma_centres_screen.dart` | `/panchakarma/centres` | — | No equivalent, confirmed by the screen's own doc comment: it hits a centre-centric `GET /public/panchakarma-centres` endpoint that has no public single-centre detail route either, and the web's `(public)/panchakarma` page is therapy-centric only — there is no centre-browse page on the website to map to. |
| `features/panchakarma/presentation/*_controller.dart` (booking flow, bookings, search) | — | — | Controllers, not screens |

## Pharmacy

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/pharmacy/presentation/medicine_search_screen.dart` | `/pharmacy` | `apps/client-web/src/app/(public)/medicines/page.tsx` | Direct |
| `features/pharmacy/presentation/medicine_detail_screen.dart` | `/pharmacy/medicine/:id` | `apps/client-web/src/app/(public)/medicines/medicine-card.tsx` | Inline-equivalent — same `HoverCard` pattern. |
| `features/pharmacy/presentation/pharmacy_detail_screen.dart` | `/pharmacy/store/:id` | — | No equivalent — on the web, a pharmacy is never a browsable entity with its own page; `pharmacy.id` only appears as an attribute on a medicine (`medicine-card.tsx`) and as a `<select>` option inside the prescription-matching flow in `patient/medicines/dashboard.tsx`. There is no "pharmacy profile" page to point at. |
| `features/pharmacy/presentation/cart_screen.dart` | `/pharmacy/cart` | `apps/client-web/src/app/patient/medicines/cart/page.tsx` (+ `cart-view.tsx`) | Direct |
| `features/pharmacy/presentation/checkout_screen.dart` | `/pharmacy/checkout` | `cart-view.tsx`'s inline Razorpay checkout | Inline-equivalent — on the web, cart review and checkout are the same page/component (`cart-view.tsx` calls the checkout API and opens Razorpay directly); mobile splits this into two separate screens/routes. |
| `features/pharmacy/presentation/medicine_order_list_screen.dart` | `/pharmacy/orders` | `apps/client-web/src/app/patient/medicines/page.tsx` (+ `dashboard.tsx` orders section) | Direct |
| `features/pharmacy/presentation/medicine_order_detail_screen.dart` | `/pharmacy/orders/:id` | — | No equivalent — `dashboard.tsx` renders each `Order`'s status/shipment inline on the dashboard; there's no separate per-order detail page. |
| `features/pharmacy/presentation/*_controller.dart` (cart, checkout flow, orders, search) | — | — | Controllers, not screens |

## Prescriptions

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/prescriptions/presentation/prescriptions_list_screen.dart` | `/prescriptions` | `apps/client-web/src/app/patient/medicines/dashboard.tsx` (prescriptions section) | Inline-equivalent, with a real caveat: the web has **no standalone "Prescriptions" page or route at all** (confirmed: `grep -rli prescription apps/client-web/src/` finds the `Prescription`/`PrescriptionItem` types only inside `patient/medicines/dashboard.tsx`, fed into the same medicine-ordering dashboard, not a separate section of the site). This is the closest honest match, not an exact one. |
| `features/prescriptions/presentation/prescription_detail_screen.dart` | `/prescriptions/:id` | same `dashboard.tsx` section | Inline-equivalent, same caveat as above. |
| `features/prescriptions/presentation/prescription_purchase_screen.dart` | `/prescriptions/:id/purchase` | `dashboard.tsx`'s pharmacy-matching + order flow | Inline-equivalent, same caveat. |
| `features/prescriptions/presentation/prescriptions_controller.dart`, `prescription_purchase_controller.dart` | — | — | Controllers, not screens |

## Profile

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/profile/presentation/profile_screen.dart` | `/profile` | `apps/client-web/src/app/patient/profile/page.tsx` (+ `profile-form.tsx`) | Direct |
| `features/profile/presentation/profile_controller.dart` | — | — | Controller, not a screen |

## Network diagnostics

| Mobile file | Route | Website equivalent | Fit |
|---|---|---|---|
| `features/network_diagnostics/presentation/connection_diagnostics_screen.dart` | `/connection-diagnostics` | — | **No equivalent, honestly.** This screen (TLS certificate/interception diagnostics, built today per the recent commit history) is a mobile-only concept — a browser already shows TLS state natively (padlock icon, certificate viewer), so the website has never needed an in-app equivalent and has no comparable page. Forcing a mapping here would be dishonest; there is nothing on the website doing this job. |

## Features with no screens yet (excluded from the table above)

`features/contact/`, `features/notifications/`, `features/payments/`, and
`features/support/` each contain only a `PHASE.md` planning file and no
`.dart` files at all — confirmed via `find`. They're not part of this
mapping because there is nothing built yet to map.
