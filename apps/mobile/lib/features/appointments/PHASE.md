# appointments

## Phase 4 — implemented

Slot booking and appointment management (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4).

- `GET /api/v1/appointments/slots?doctorProfileId=&mode=&from=&days=` — `BookingController` loads this
  on entry and on every consultation-mode change (`booking_controller.dart`).
- `POST /api/v1/appointments/hold` — `BookingController.confirmBooking`. **Before** calling this,
  `confirmBooking` always re-fetches the slot list for the selected day and refuses to proceed if the
  chosen slot isn't in that fresh response, showing a "no longer available" state instead
  (`HoldOutcomeKind.conflict`) — availability is never trusted from an earlier fetch at the moment of
  booking (brief §7's own rule, restated in this phase's exit criteria).
- `POST /api/v1/appointments/verify-payment`, `POST /api/v1/appointments/[id]/cancel`,
  `POST /api/v1/appointments/[id]/review`, `GET /api/v1/appointments/mine` — `AppointmentsApi`/
  `AppointmentsController`/`AppointmentListScreen`.

**Payment, read from the real code before building anything** (`holdSlot()` in
`packages/domain/src/modules/appointments/appointments.service.ts`, `isConfigured()` in
`packages/domain/src/lib/payments/razorpay.ts`): `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are blank in
this environment's `.env` today, so every real `/hold` call in this environment throws a 503
`ServiceUnavailableError` *before* any appointment/payment row is even created. `BookingController`
treats that specific status code as its own `HoldOutcomeKind.serviceUnavailable` state — a calm,
expected, displayable banner ("booking isn't available in this environment yet"), never an error toast
or a crash. The full success path (`AppointmentHold`, parsed from `holdSlot()`'s real
`{ appointment, payment, razorpayOrder, razorpayKeyId }` shape) is implemented and unit-tested against a
fake API, but is not reachable in this environment and has no real Razorpay Flutter SDK call behind it —
that integration is explicitly **deferred to Phase 8** (docs/mobile/IMPLEMENTATION-PLAN.md Phase 8,
docs/mobile/API-GAP-ANALYSIS.md §5), once real keys exist somewhere this app can actually be tested
against end to end. `AppointmentsApi.verifyPayment` is implemented against the real
`/verify-payment` contract for the same forward-compatibility reason; the booking screen's own doc
comment is explicit that only the backend's response to that call, never a client-side payment-provider
callback, could ever be treated as confirmation.

Domain models (`domain/`): `AppointmentSlot` (`/slots` response), `AppointmentHold` (`/hold`'s success
shape), `AppointmentDetail` (the full `listMineAsPatient()` include shape — doctor, clinic, family
member, payment, consultation — distinct from Phase 3's narrower `AppointmentSummary`, which stays
as-is for the home dashboard), `ReviewSubmission`.

`AppointmentsController.cancel`/`.review` both reload the full `/mine` list afterwards rather than
patching one entry in place — simpler, and correct even though `/cancel`'s own response is a bare,
un-included appointment row (no doctor/clinic/payment joins — confirmed by reading that route), unlike
`/mine`'s.

## Still not this phase

- No real Razorpay Flutter SDK integration (Phase 8, once real keys exist to test against — see above).
- No reschedule flow (`RESCHEDULED` is a modeled `AppointmentStatus` value but nothing in this phase
  writes it).
- `AppointmentListScreen` is reachable via `/appointments` and from tapping Phase 3's home-dashboard
  "Upcoming appointments" tile, but there's no persistent bottom-nav/tab entry for it yet — this app has
  no tab shell at all yet, a Phase 3-and-earlier scope choice this phase didn't revisit.
