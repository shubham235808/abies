# Admin Portal — Module-by-Module Status Report

Prepared against the brief requesting a "fully functional, centralized Admin
Portal." Every verdict below is based on reading the actual route handler
and service code (not file existence alone). File:line references are given
so each claim can be re-checked directly.

Legend: ✅ exists & works · 🟡 partial / incomplete / stubbed · ❌ missing

---

## A. Products & Pharmacy Management — 🟡 Partial

**What works:**
- Admin CAN create a new master catalogue product (not just view). Multipart
  POST with text fields + image file:
  `apps/platform-api/src/app/api/v1/admin/products/route.ts:23-50`,
  backed by `createAdminProduct` in
  `packages/domain/src/modules/medicines/admin-products.service.ts:60-97`.
- Image upload is real: validated (JPEG/PNG/WebP, 2MB max), stored via the
  generic S3/MinIO adapter (`putObject`), served back at
  `/api/v1/catalogue/images/{file}` — `admin-products.service.ts:78-86`.
- Fields supported: name, genericName, brandName, category, mrp,
  requiresPrescription — `admin-products.service.ts:11-18`.
- Every create is audited (`PRODUCT_CREATED`, `admin-products.service.ts:88-94`).
- Pharmacy "management" exists but is **verification-only**: approve/
  reject/suspend/start-review of a self-registered pharmacy application
  (`apps/platform-api/src/app/api/v1/admin/pharmacies/[id]/{approve,reject,suspend,start-review}/route.ts`,
  logic in `packages/domain/src/modules/medicines/admin-pharmacies.service.ts:66-143`).

**What's missing/incomplete:**
- ❌ No product **edit** endpoint at all — `admin/products/route.ts` exports
  only `GET`/`POST`, no `PUT`/`PATCH`/`DELETE`. Once created, a product's
  name/category/MRP/image cannot be changed from the admin portal.
- ❌ No active/inactive (publish/unpublish) toggle in the UI, even though the
  `Medicine.active` column exists in the schema
  (`packages/domain/prisma/schema.prisma:1314`) — it's simply never exposed
  to `listAdminProducts`'s consumer UI as an editable control
  (`apps/management-web/src/app/ops/admin/products/page.tsx:16-53` renders it nowhere, and there's no route to flip it).
- ❌ No variant management from admin — `MedicineVariant` exists
  (`schema.prisma:1384`) but nothing under `admin/products/` creates/edits one.
- ❌ No inventory/stock or selling-price editing by admin at all. Stock and
  price live on `PharmacyInventory` (`schema.prisma:1402-1420`) and are
  **pharmacy self-service only**, via `apps/partner-web/src/app/partner/pharmacy/page.tsx` —
  confirmed by grepping every file that touches `PharmacyInventory`: the only
  hits are `partner-web`'s own page, `cart.service.ts`, and the admin
  product-creation file (which only reads `Medicine`, never
  `PharmacyInventory`). Admin has no view into per-pharmacy stock/price at all.
- Category is a free-text input (`create-product-form.tsx:72-75`), not a
  managed taxonomy — though `admin/configuration/categories` exists
  separately as its own config list (not wired to this form for selection).

---

## B. Doctor Management — 🟡 Partial (verification only, no authoring)

**What works:**
- Full onboarding verification workflow: start-review / approve / reject /
  suspend, each a real state transition with audit logging —
  `packages/domain/src/modules/doctors/admin-doctors.service.ts` (mirrors the
  pharmacy pattern above).
- Per-document review (verify/reject/request resubmission) and signed-URL
  document download —
  `apps/platform-api/src/app/api/v1/admin/doctors/[id]/documents/[documentId]/{review,download}/route.ts`.
- Rich detail view: qualifications, documents, clinics, availability,
  verification history — `apps/management-web/src/app/ops/admin/doctors/[id]/review-panel.tsx`.

**What's missing:**
- ❌ **No "create a new doctor profile" capability anywhere.** `admin/doctors/route.ts`
  (`apps/platform-api/src/app/api/v1/admin/doctors/route.ts`) only exports
  `GET` (the verification queue). The only way a `DoctorProfile` row is ever
  created is via the doctor's own self-registration flow
  (`packages/domain/src/modules/doctors/doctors.service.ts`). Admin can only
  approve/reject what a doctor submitted themselves.
- ❌ **No top-level list page.** There is no
  `apps/management-web/src/app/ops/admin/doctors/page.tsx` — only `[id]/page.tsx`.
  The queue view lives entirely in the consolidated
  `apps/management-web/src/app/ops/admin/verification/page.tsx` (see its own
  header comment, lines 11-16: "consolidates what used to be 5 standalone
  queue pages ... into one tabbed Verification Centre").
- ❌ No photo upload by admin (doctor photo, if any, is self-uploaded via the
  doctor's own flow, not touched by `admin-doctors.service.ts`).
- ❌ No fee configuration by admin. `videoFee`/`clinicFee` are columns on
  `DoctorProfile` (`schema.prisma:453-454`) but `admin-doctors.service.ts`
  never writes them — they're doctor self-service only.
- ❌ No availability management by admin — the review panel only **displays**
  `doctor.availability` (`review-panel.tsx:227-237`); there's no edit control.
- 🟡 Settlement/commission *is* configurable for doctors, but via a separate
  generic module, not from the doctor record itself — see section F.

---

## C. Panchakarma Management — 🟡 Partial (identical pattern to B)

**What works:**
- Centre verification workflow (start-review/approve/reject/suspend) —
  `packages/domain/src/modules/panchakarma/admin-centres.service.ts:67-144`,
  explicitly commented as mirroring labs/pharmacies
  (`admin-centres.service.ts:7-10`).
- Therapist document review —
  `apps/platform-api/src/app/api/v1/admin/therapists/[id]/documents/[documentId]/{review,download}/route.ts`.

**What's missing:**
- ❌ Admin **cannot** add a new centre, therapy/treatment, or therapist.
  `createTherapy` / `updateTherapy` / `createTherapist` / `updateTherapist`
  exist (`packages/domain/src/modules/panchakarma/catalogue.service.ts:29-66`)
  but are centre-self-service only, called exclusively from
  `apps/platform-api/src/app/api/v1/panchakarma-centres/me/{therapies,therapists}/route.ts`
  and rendered in
  `apps/partner-web/src/app/partner/panchakarma-centre/{therapies,therapists}/*-manager.tsx`.
  No admin route calls either function.
- ❌ No admin-side photo upload, pricing, or duration config for
  treatments/therapists — all of that is set by the centre itself through
  the same self-service catalogue service.
- Same "no top-level list page, consolidated into Verification Centre" gap
  as doctors.

---

## D. Diagnostics Management — ❌ Confirmed missing (for tests/packages)

Checked thoroughly rather than assumed from the name:

- `admin/labs` (`apps/platform-api/src/app/api/v1/admin/labs/*`,
  `packages/domain/src/modules/diagnostics/admin-labs.service.ts`) is, like
  doctors/pharmacies/centres, **lab-partner verification only**
  (approve/reject/suspend of the `DiagnosticLab` application).
- `DiagnosticTest` and `DiagnosticPackage` models exist in the schema
  (`schema.prisma:1064`, `1094`), and CRUD for them exists —
  `createTest`/`updateTest`/`removeTest`/`createPackage`/`updatePackage`/`removePackage`
  in `packages/domain/src/modules/diagnostics/catalogue.service.ts:26-104`.
  But every caller is a **lab partner's own route**:
  `apps/platform-api/src/app/api/v1/labs/me/{tests,packages}/route.ts`, and
  the UI is `apps/partner-web/src/app/partner/lab/tests/tests-manager.tsx`.
- There is **no `admin/diagnostics` route or page of any kind**, and no admin
  route anywhere calls `createTest`/`createPackage`. An admin cannot create,
  edit, or price a diagnostic test or package — only the lab partner can,
  and admin's only lever over diagnostics is approving/suspending the lab
  itself.

**Verdict: this module is genuinely, fully missing** on the admin side,
exactly as the user suspected.

---

## E. Website & Mobile App Content Management — 🟡 Partial (one real piece, rest absent)

A repo-wide search for banners/About-Us/FAQ/blog/testimonials/navigation
config/SEO metadata/multilingual content/promotional video turned up
**one real, working system** and nothing else:

**What works — Promotion/Banner manager (real CMS-lite):**
- Prisma model `Promotion` — `packages/domain/prisma/schema.prisma:2585-2610` —
  with desktop+mobile image keys, placement enum (`PUBLIC_HOME_HERO`,
  `PUBLIC_HOME_SERVICES`, `PATIENT_HOME_HERO`, `PATIENT_HOME_DOCTORS`,
  `PATIENT_HOME_DIAGNOSTICS`, `PATIENT_HOME_MEDICINES`,
  `PATIENT_HOME_PANCHAKARMA` —
  `packages/domain/src/modules/promotions/promotions.schemas.ts:3-11`),
  scheduling (`startAt`/`endAt`), priority, active flag, location/language
  targeting (`targetLocations`/`targetLanguages`), and impression/click
  counters.
- Full admin CRUD with image upload:
  `apps/platform-api/src/app/api/v1/admin/promotions/route.ts` +
  `[id]/route.ts`, UI at
  `apps/management-web/src/app/ops/admin/promotions/page.tsx` +
  `promotions-manager.tsx`.
- Genuinely consumed on the **public** site: `apps/client-web/src/components/promotions/promotion-banner.tsx`
  renders `activePromotionsForPlacement()`
  (`packages/domain/src/modules/promotions/promotions.service.ts:144`) on
  `apps/client-web/src/app/(public)/page.tsx` and `apps/client-web/src/app/patient/page.tsx`.
  This is a real end-to-end "admin changes it, public site shows it" loop —
  see the Dynamic/No-Hardcoding section below for the concrete trace.
- `targetLanguages` gives this a thin multilingual-targeting hook, but it
  targets which language-users *see* a banner — it is not a translation/i18n
  system for the banner's own text.

**What's missing (confirmed absent by repo-wide search, no false negatives):**
- ❌ No About Us / FAQ / blog / static-page content model or admin UI at all.
- ❌ No testimonials model/UI.
- ❌ No navigation-menu configuration (nav is still hardcoded in each app's
  layout/header components).
- ❌ No SEO metadata management (title/description/OG tags per page) —
  nothing in the schema or admin routes addresses this.
- ❌ No general multilingual *content* management (copy/translations) —
  only the above banner-targeting flag.
- ❌ No promotional video/creative library beyond the two image slots on
  `Promotion`.

**Verdict:** the single biggest real gap in the brief, confirmed — except
the one carve-out above, which is a legitimately working banner system and
should not be mischaracterized as "nothing exists."

---

## F. Pricing, Payments & Commission Management — 🟡 Partial, real but narrow

**What works:**
- **Commission/fee-term management is real and works**: `createFeeTerm` /
  `updateFeeTerm` / `removeFeeTerm` across all four partner kinds (`DOCTOR`,
  `DIAGNOSTIC_LAB`, `PHARMACY`, `PANCHAKARMA_CENTRE`) —
  `packages/domain/src/modules/settlement/fee-terms.service.ts:12-66`, gated
  by `requirePermission(ctx, 'settlement.manage')`
  (`apps/platform-api/src/app/api/v1/admin/settlement/fee-terms/route.ts:20`),
  UI at `apps/management-web/src/app/ops/admin/settlement/fee-terms-manager.tsx`.
  Percentage or fixed-amount fee models, effective-date windows, full CRUD.
- Settlement cycles (create/lock/complete/generate-payouts) and payout
  reconciliation (mark-paid/mark-failed) are real workflows —
  `apps/platform-api/src/app/api/v1/admin/settlement/settlements/[id]/{complete,lock,generate-payouts}/route.ts`,
  `.../payouts/[id]/{mark-paid,mark-failed,reconciliation}/route.ts`.
- Refunds: approve/reject workflow —
  `apps/platform-api/src/app/api/v1/admin/refunds/[id]/{approve,reject}/route.ts`,
  backed by `packages/domain/src/modules/payments/refunds.service.ts` (164 lines,
  a real state machine, not a stub).
- All of the above write `recordAuditEvent` calls
  (e.g. `FEE_TERM_UPDATED` — `fee-terms.service.ts:53`), so commission-rate
  changes **are** audited.

**What's missing/incomplete:**
- ❌ **Price-change audit is narrower than it sounds.** `admin/audit`
  (`apps/platform-api/src/app/api/v1/admin/audit/route.ts`) queries the
  generic `AuditEvent` table via `listAuditEvents`
  (`packages/domain/src/modules/audit/audit.service.ts`) and is **not**
  scoped to role/permission changes only — it genuinely captures
  `PRODUCT_CREATED`, `FEE_TERM_UPDATED/DELETED`, pharmacy/doctor/centre
  verification events, refunds, staff changes, etc. (confirmed by grepping
  every `recordAuditEvent` call site — 38 files across every admin module).
  **However**, because there is no product-price-*edit* endpoint (see A) and
  no admin-side `PharmacyInventory.price` edit endpoint, there is literally
  no "product/stock price change" admin action to audit yet — the audit
  *mechanism* for price changes is ready and proven (it already logs fee-term
  rate changes), but there's no admin price-edit action feeding it for retail
  products.
- 🟡 Promotions module (E) has no price concept at all — it's purely
  marketing creative, not a pricing lever.

---

## G. Orders, Bookings & Customer Management — ✅ Substantially complete

This is the most mature area of the admin surface.

- Full CRM suite: leads, opportunities, pipeline, automation rules, task
  management, duplicate detection — `apps/management-web/src/app/ops/crm/*`,
  backed by `packages/domain/src/modules/crm/{leads,sales,automation,enterprise,customer360}.service.ts`
  and its own fine-grained RBAC layer (`packages/domain/src/modules/crm/rbac.ts`).
- Customer 360 view ties a user's cross-vertical activity together —
  `customer360.service.ts:35` (`customerSummary`).
- Support ticketing with SLA tracking —
  `packages/domain/src/modules/support/{tickets,sla}.service.ts`,
  `apps/management-web/src/app/ops/customer-support/`.
- Sales ops surface (leads/tickets) at `apps/management-web/src/app/ops/sales/*`.
- Admin reports are real, exportable CSVs, not mocked: `revenue`, `volume`,
  `support-sla`, `partner-funnel` —
  `apps/platform-api/src/app/api/v1/admin/reports/[report]/route.ts:10-16`,
  backed by `packages/domain/src/modules/admin/reports.service.ts`.

**Minor gap:** there's no single consolidated "all orders/bookings across
every vertical" admin list screen — order/booking detail is reached per
customer (Customer 360) or per partner app, not through one unified orders
table. This is a usability gap, not a missing capability; the underlying
data and reporting are real.

---

## H. Communication Management — ❌ Confirmed: templates are code/env, not admin-editable

This needed the most careful check, and the brief's suspicion is correct —
with one nuance worth being precise about:

- There **is** an admin CRUD surface that looks like a template manager:
  `NotificationTemplate` model, `apps/platform-api/src/app/api/v1/admin/configuration/notification-templates/route.ts`
  (+ `[id]/route.ts`), UI at
  `apps/management-web/src/app/ops/admin/configuration/notification-templates-manager.tsx`,
  service functions `listNotificationTemplates`/`createNotificationTemplate`/...
  in `packages/domain/src/modules/configuration/configuration.service.ts:161-184`.
- **But it's a dead end.** Grepping every use of `prisma.notificationTemplate`
  in the codebase shows it is read/written **only** inside
  `configuration.service.ts` — nothing in the actual send path ever queries
  it. The real send path is:
  `packages/domain/src/modules/notifications/templates.ts` — its own header
  comment says it plainly (line 1): *"Code-registered, versioned
  notification template catalogue."* `resolveAndRender`/`getTemplateDefinition`
  (`templates.ts:446,455`) resolve against an in-code `TemplateDefinition`
  map, not the database.
  - Email bodies: `packages/domain/src/modules/notifications/email-templates.ts`
    (hardcoded segments).
  - WhatsApp provider template IDs: `senders.ts`'s `PROVIDER_TEMPLATE_IDS` /
    the `WHATSAPP_MSG91_TEMPLATE_MAP` env var, read in
    `packages/domain/src/lib/notifications/msg91-whatsapp.ts:27,52` — this is
    the K8s Secret value referenced elsewhere in this project's history.
- So an admin can create/edit rows in the `NotificationTemplate` table all
  day through the UI, and **it will have zero effect** on what a customer
  actually receives by WhatsApp or email. This is worse than "no admin UI" —
  it's a UI that silently does nothing, which is an easy trap for whoever
  built or will use it to fall into.

**Verdict: confirmed missing** — not just "hardcoded templates with no UI,"
but a UI that exists and appears to work while being disconnected from the
real send logic.

---

## Media Library — 🟡 Foundation exists, no admin-facing library

- A real, generic, reusable S3/MinIO-compatible object storage adapter
  exists: `packages/domain/src/lib/storage.ts` —
  `putObject`/`getSignedDownloadUrl`/`getObjectBytes`/`deleteObject`
  (lines 34-70). Its own header comment (lines 11-14) states every file in
  the system goes through it.
- It is reused by multiple, independent modules — confirmed callers:
  `diagnostics/orders.service.ts`, `doctors/doctors.service.ts`,
  `medicines/admin-products.service.ts`, `panchakarma/catalogue.service.ts`,
  `partners/leads.service.ts`, `promotions/promotions.service.ts`,
  `support/tickets.service.ts`.
- **But there is no generic admin media-library endpoint or UI.** Every
  upload is bespoke and single-purpose: the products route only accepts one
  product image on create, the promotions route only accepts its two banner
  images, etc. There is no `/api/v1/admin/media` (or equivalent) that lists,
  browses, or lets an admin re-use a previously uploaded asset across
  modules. A real media library would be built *on top of* `storage.ts`
  (the hard infrastructure part already exists and is proven), but the
  library itself — browse/search/reuse — does not exist.

---

## Dynamic, No-Hardcoding Content — ✅ Confirmed for areas that have admin CRUD

Traced one concrete path end-to-end, no rebuild/redeploy involved:

1. Admin submits the "Add promotion" form →
   `POST /api/v1/admin/promotions` →
   `createPromotion()` (`promotions.service.ts:42`) writes a new `Promotion`
   row to Postgres and the image to MinIO via `putObject`.
2. A patient loads the homepage → `apps/client-web/src/app/(public)/page.tsx`
   calls `activePromotionsForPlacement('PUBLIC_HOME_HERO', ...)`
   (`promotions.service.ts:144`), which is a plain Prisma query against the
   same `Promotion` table, filtered by `active`/`startAt`/`endAt`/placement.
3. `PromotionBanner` (`apps/client-web/src/components/promotions/promotion-banner.tsx`)
   renders whatever came back from that query.

No code path is cached at build time, no static generation freezes this —
it's a live DB read on every request, so yes: for every area that actually
has admin CRUD (products, promotions, fee-terms, staff, GST rates, etc.),
a change takes effect immediately with no rebuild. The caveat is simply that
this only applies to the areas with real CRUD — it says nothing about the
areas in D/E/H that have no admin write path to begin with.

---

## RBAC — 🟡 Partial: role-gated, not sub-role-gated for the admin portal

- `requireAdminMfa()` (`packages/domain/src/server/rbac.ts:77-82`) is the
  gate on essentially every admin route in this report, and it is defined as
  `requireRole(ctx, 'ADMIN')` **plus** MFA — a single, flat `ADMIN` role
  check, not a spectrum.
- A `UserRole` enum does have many values —
  `PATIENT, DOCTOR, ADMIN, LAB, PHARMACY, PANCHAKARMA_CENTRE,
  CUSTOMER_SUPPORT, TECH_SUPPORT, SALES, CARE_COORDINATOR, CRM_ADMIN,
  SALES_MANAGER, MARKETING, AUDITOR`
  (`packages/domain/prisma/schema.prisma:23-38`) — but per
  `packages/domain/src/server/permissions.ts:20-33`, every one of those
  except `ADMIN`, `LAB`, `PHARMACY`, `PANCHAKARMA_CENTRE` has an **empty**
  permission list, and none of them satisfy `requireAdminMfa`'s role check.
  So `CRM_ADMIN`/`SALES_MANAGER`/`MARKETING`/`AUDITOR` exist as roles (and
  are meaningful inside the separate CRM RBAC layer,
  `modules/crm/rbac.ts`) but **cannot access any route in this report** —
  they're not "Doctor Manager" or "Finance" sub-admins of the main admin
  portal, they're a disjoint access system for the CRM module only.
- `requirePermission()` is an additive finer-grained check
  (`rbac.ts:60-71`, permissions.ts), but its own comment says it plainly:
  *"Today this is a static, role-keyed vocabulary (one role == one
  permission set); a DB-backed, admin-editable set is the named later
  refinement."* And since `ADMIN` already holds all four permissions that
  exist (`promotion.manage`, `configuration.manage`, `settlement.manage`,
  `hospital.manage`), `requirePermission` currently adds no real
  restriction for anyone who already has `ADMIN` — which is the only role
  that can reach these routes in the first place.
- `admin/staff` (`createStaffAccount`,
  `packages/domain/src/modules/staff/staff.service.ts:24`) can create
  accounts with these roles, but giving someone e.g. `MARKETING` does not
  grant them access to Promotion Manager or anything else in this report —
  only `ADMIN` does, and `ADMIN` is all-or-nothing.

**Verdict:** confirmed — there is no Super Admin / Product Manager / Doctor
Manager / Finance / Marketing / Support admin-role separation for the admin
portal today. It is effectively one flat `ADMIN` role, with a *parallel*
unrelated RBAC system for CRM only.

---

## If we build one thing first

Given everything above, my honest recommendation, in order:

1. **Fix H (Communication Management) first, specifically the dead-template
   trap** — not because it's the biggest gap (E is bigger), but because it's
   actively misleading right now: admins can edit `NotificationTemplate` rows
   through a working-looking UI and reasonably believe they changed what
   customers receive, when nothing happens. Either wire `templates.ts`'s
   `resolveAndRender` to read from that table (the hard storage/audit/CRUD
   plumbing already exists — `configuration.service.ts` already does the DB
   side) or remove the UI until it's wired, so nobody ships a comms change
   that silently never goes out. This is a half-day to a few-days fix on
   infrastructure that's 90% already built, and it removes a trap rather
   than adding a feature.

2. **Then D (Diagnostics tests/packages admin authoring)** — it's the
   cleanest, most contained genuinely-missing module: the data model
   (`DiagnosticTest`/`DiagnosticPackage`) and the create/update/remove
   service functions already exist in
   `diagnostics/catalogue.service.ts`; the gap is purely "no admin route
   calls them." This can likely reuse the exact
   `labs/me/tests`+`labs/me/packages` request/response shapes, just mounted
   under `admin/` with an admin-selected `labId` instead of session-derived
   `userId`. High leverage, low net-new design work.

3. **Then close the A/B/C "verification-only" gap for one vertical
   end-to-end** (Products is the furthest along — it already has create +
   image upload; it's missing only edit/active-toggle/variant support) as a
   template, before replicating the same create/edit/variant pattern to
   doctors/panchakarma/labs. Doing one vertical properly first avoids
   building the same half-feature five times.

4. **E (Website/App Content)** is the single largest gap by scope (About
   Us/FAQ/blog/testimonials/nav/SEO), but I'd deliberately sequence it after
   1–3: it is genuinely greenfield (no existing model, no existing service to
   extend), so it is the most expensive item per unit of user-visible value,
   and the existing Promotion/Banner system already covers the
   highest-traffic piece of "content" (the homepage hero). I'd scope it as
   its own dedicated effort rather than folding it into this round.

5. **RBAC sub-roles** (Super Admin/Product Manager/Finance/etc.) is real
   work the platform will eventually need, but every module above is
   currently gated by a single `ADMIN` role check — adding sub-roles without
   first having real per-module write paths (A–D) to gate would be designing
   permissions for capabilities that don't exist yet. This should follow,
   not lead, the module build-out.
