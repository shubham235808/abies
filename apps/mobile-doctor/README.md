# ABIES Doctor (Flutter)

Mobile app for **DOCTOR-role partners** on the ABIES Ayurveda platform: the Doctor app from the
platform's role-specific mobile-app spec. It uses the same `/api/v1/*` backend as the web partner
portal (`apps/partner-web/src/app/partner/doctor`), with no separate database and no new endpoints.
Its architecture is copied from `apps/mobile` (the patient app): a Dio `ApiClient` with an
`abies_session` cookie jar held in secure storage, `X-Request-Id`, `ApiException` mapping, and a
401 broadcast; build flavors through `ABIES_ENV`; the real ABIES brand theme; Riverpod; and
go_router with a pure, unit-tested redirect decision.

## Run

    flutter pub get
    flutter run --dart-define=ABIES_ENV=dev -t lib/main_dev.dart   # dev.abies.in
    flutter analyze && flutter test

## What it does (MVP)

- **Auth**: password sign-in (mobile or email), forced first-time password setup, forgot password,
  and an OTP-based **Apply as a doctor** flow (`/auth/otp/request` with `role: DOCTOR`, then
  `/auth/otp/verify`). This mirrors the web split between `/partner/login` and
  `/partner/login/apply`. Only DOCTOR sessions are accepted; any other role is logged out.
- **Dashboard**: shows verification status and application completeness for unapproved
  doctors. Approved doctors see the next patient, today's schedule, upcoming consultations and
  history.
- **Consultation workspace**:
  - Start and complete the consultation.
  - Edit visit details.
  - Save and finalize the clinical note.
  - Create and edit draft prescriptions, finalize them, or correct a finalized one (the
    correction supersedes it with a new draft).
  - Recommend diagnostics or Panchakarma, picking from the public catalogue search.
  - For VIDEO consultations, record the doctor's join.
- **Availability**: add, pause and remove weekly windows.
- **Profile**: view, plus editing of every `updateDoctorProfileSchema` field the web form edits
  (`PATCH /doctors/me`) and submit-for-verification (`POST /doctors/me/submit`). Editing is only
  possible in DRAFT or REJECTED status, the same lock the backend applies; in any other status the
  profile is read-only and shows the lock message.
- **Documents**: list with the admin review status (Pending review, Verified, Rejected,
  Resubmission required) and the reviewer's note. Upload PDF, JPG or PNG files up to 10 MB through
  `file_picker`, view a document through its short-lived signed URL, and remove documents.
  Credential documents are locked outside DRAFT/REJECTED unless a document has been flagged for
  resubmission. The profile photo can be changed in any status.
- **Clinics**: add, edit, mark active or inactive, and remove. Clinics are not locked by
  verification status.

## Status

`flutter analyze` is clean and the unit tests in `test/unit` pass. The app has not been run on a
device or emulator.
