# doctors

## Phase 4 — implemented

Real doctor discovery (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4), replacing Phase 3's narrower home
preview row and the Phase 1 `/doctor/:slug` placeholder.

- `GET /api/v1/public/doctors` — the real search screen (`doctor_search_screen.dart`), using the full
  filter set from `publicDoctorSearchSchema` (`packages/domain/src/modules/doctors/doctors.schemas.ts`):
  free-text `q`, `city`, `specialty`, `language`, consultation `mode`, `accepting`, plus `limit`/`offset`
  pagination (`DoctorSearchController.loadMore`). Phase 3 only ever used `city` + `limit`.
- `GET /api/v1/public/doctors/facets` — populates the filter sheet's dropdowns from real, currently-valid
  option values (`doctorFacetsProvider`), never a hardcoded list.
- `GET /api/v1/public/doctors/[slug]` — the real detail screen (`doctor_detail_screen.dart`): bio,
  registration/qualification, specialties, languages, consultation modes and their fees, clinics,
  weekly availability windows. A slug that 404s gets a clean "not available" state, not a blank screen
  or crash (`DoctorDetailScreen`'s `error` branch — docs/mobile/API-GAP-ANALYSIS.md §7).
- `GET /api/v1/public/doctors/[slug]/reviews` — shown on the same detail screen.
- `GET /api/v1/public/doctors/[slug]/photo` — confirmed by reading that route: a public 302 redirect to
  a signed storage URL, no session cookie required. `DoctorsApi.absolutePhotoUrl` resolves the
  backend-relative `photoUrl` field to an absolute URL for a plain `Image.network` (no Dio involved).

Domain models (`domain/`): `DoctorSummary` (search card — a fuller sibling of Phase 3's
`DoctorPreview`, which stays as-is for the home dashboard), `DoctorDetail` (adds bio, registration
detail, and `availability[]`), `DoctorFacets`, `DoctorSearchResult` (keeps `total`/`offset`/`limit` for
pagination), `DoctorReview`, plus small `Clinic`/`AvailabilityWindow` value types shared by both
`DoctorSummary` and `DoctorDetail`.

`DoctorSearchController` prefills the city filter from the signed-in patient's own profile city (same
location-signal decision as Phase 3's home preview — a default, not a requirement; the patient can
clear/change it in the filter sheet).

## Still not this phase

- No map view, no sort-order picker beyond the backend's own default ordering (rating → experience →
  oldest-first).
- The language-ranking signal (`languageMatch`) is parsed and shown as a "Speaks your language" chip when
  present, but this phase doesn't add a UI control to opt into/out of it — it's whatever the backend
  decides to send today.
- Booking itself (slot selection, hold, payment, confirmation) lives in `lib/features/appointments/` —
  this feature only gets the patient to a "Book" button.
