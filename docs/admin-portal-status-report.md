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

## D. Diagnostics Management — ✅ Admin can now author tests/packages for any approved lab

Previously confirmed fully missing; closed as follows:

- `admin/labs` (`apps/platform-api/src/app/api/v1/admin/labs/*`,
  `packages/domain/src/modules/diagnostics/admin-labs.service.ts`) remains
  lab-partner **verification only** (approve/reject/suspend of the
  `DiagnosticLab` application) — unchanged, and still the only place to
  approve a lab before it can be picked here.
- `DiagnosticTest` and `DiagnosticPackage` CRUD
  (`packages/domain/src/modules/diagnostics/catalogue.service.ts`) was
  refactored so the lab-scoped core logic (`createTestForLab`,
  `updateTestById`, `removeTestById`, `createPackageForLab`,
  `updatePackageById`, `removePackageById`, and their `listXForLab`
  counterparts) no longer assumes the caller's own session — the
  lab-partner's `createTest`/`updateTest`/`removeTest`/`createPackage`/
  `updatePackage`/`removePackage` now resolve their own `labId` from the
  session and delegate to the same primitives. New `adminCreateTest` /
  `adminUpdateTest` / `adminRemoveTest` / `adminListTests` and the package
  equivalents (`adminCreatePackage`/`adminUpdatePackage`/`adminRemovePackage`/
  `adminListPackages`) wrap those primitives with an admin-chosen `labId`
  (validated APPROVED before create) and `recordAuditEvent` calls
  (`DIAGNOSTIC_TEST_CREATED/UPDATED/REMOVED`,
  `DIAGNOSTIC_PACKAGE_CREATED/UPDATED/REMOVED`) — no duplicated business
  logic, same validation (duplicate-code check, package test-ownership
  check) as the lab-partner path.
- New admin routes, all gated by `requireAdminMfa` (role ADMIN is already
  sufficient — no new `Permission` value was needed):
  `apps/platform-api/src/app/api/v1/admin/diagnostics/tests/route.ts`
  (GET list across all labs / optional `?labId=`, POST create),
  `.../tests/[id]/route.ts` (PATCH, DELETE), and the mirrored
  `.../packages/route.ts` + `.../packages/[id]/route.ts`.
- New admin UI at `apps/management-web/src/app/ops/admin/diagnostics/`
  (`page.tsx`, `tests-manager.tsx`, `packages-manager.tsx`), linked from the
  admin nav (`apps/management-web/src/app/ops/admin/layout.tsx`). A lab
  picker (populated from the existing `queue('APPROVED')` in
  `admin-labs.service.ts` — no new "list approved labs" function needed)
  is required on create; a package's test checklist is filtered to the
  selected lab's own tests, mirroring the lab-partner UI's own package form.

**What's still missing/out of scope (left out deliberately):**
- An admin cannot move an existing test or package to a different lab —
  `labId` is set once at creation; the edit forms show the owning lab as
  fixed text. Reassignment wasn't asked for and doesn't map cleanly onto
  the existing package test-ownership validation.
- No photo/image support for a test or package — the schema has none and
  none was added; this mirrors the lab-partner's own tests/packages UI,
  which also has no image field.
- No bulk import/export of tests or packages.
- The admin `GET` list routes cap at 500 rows (`take: 500`), with no
  pagination UI yet — acceptable for the current catalogue size, but would
  need revisiting if any one lab's catalogue grows large.

---

## E. Website & Mobile App Content Management — ✅ Website CMS complete for what was asked (pages, nav, SEO, FAQ, testimonials, banners); blog/i18n/video still absent

A repo-wide search for banners/About-Us/FAQ/blog/testimonials/navigation
config/SEO metadata/multilingual content/promotional video originally turned
up **one real, working system** and nothing else. An EXPANSION-5 content
pass closed the About Us/FAQ/Testimonials part of that gap, modeled
directly on the Promotion system below. A follow-up pass (this update)
closed the three things that pass deliberately deferred: admin-editable
navigation menus, per-page SEO metadata, and multi-page ContentPage
management.

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

**What works now — About Us, FAQ and Testimonials (added, EXPANSION-5):**
Modeled directly on Promotion's admin-CRUD + public-read pattern, not a
new shape invented from scratch.

- Three new Prisma models, additive-only migration
  `packages/domain/prisma/migrations/20261010100000_content_management/`:
  - `ContentPage` — generic slug-keyed static page (`slug` unique, `title`,
    `body` plain text, `active`, timestamps). Originally only `about-us`
    was exposed in the admin UI; see the follow-up section below for the
    generic pages manager.
  - `FaqEntry` — one row per question/answer pair (`question`, `answer`,
    `priority`, `active`, timestamps), kept deliberately separate from
    `ContentPage` since FAQ is an admin-reorderable list, not one page
    body.
  - `Testimonial` — `authorName`, `authorRole` (optional), `quote`,
    `photoKey` (optional, same `putObject`/signed-URL pattern as
    Promotion's images), `rating` (optional, 1–5), `priority`, `active`,
    `createdByUserId`, timestamps.
  - Verified by applying the full migration chain to a throwaway
    `abies_shadow_check` database on the same Postgres container (same
    method documented in `docs/password-auth-backend.md`), then confirmed
    against the real dev database and covered by
    `tests/integration/content.test.ts` (7 passing cases).
- Services: `packages/domain/src/modules/content/{about,faq,testimonials}.service.ts`
  + matching `.schemas.ts`, each with the Promotion-style
  `recordAuditEvent` call on every create/update/delete
  (`eventType: 'CONTENT'`).
- Admin routes (gated by `requireAdminMfa` + `requirePermission(ctx,
  'configuration.manage')` — reusing the existing configuration-domain
  permission rather than adding a new `Permission` value, consistent with
  how GST rates/categories/locations are gated):
  `apps/platform-api/src/app/api/v1/admin/content/about/route.ts` (GET +
  singleton `PUT`/upsert — there is exactly one About Us page, so no
  create/list/delete verbs), `.../content/faq/route.ts` + `[id]/route.ts`
  (full list/create/update/remove), `.../content/testimonials/route.ts` +
  `[id]/route.ts` (full CRUD, multipart photo upload mirroring the
  Promotion routes' `FormData` handling).
- Admin UI at `apps/management-web/src/app/ops/admin/content/` (`page.tsx`
  with the same `Tabs`-over-one-route shape as `/ops/admin/configuration`;
  the original single-page `about-manager.tsx` has since been replaced by
  the generic `pages-manager.tsx` — see below; `faq-manager.tsx`
  and `testimonials-manager.tsx` are card-list managers with add/edit/
  activate/remove, FAQ additionally with move-up/move-down reordering
  since no drag-and-drop library exists in this repo). Linked from the
  admin nav as "Content" (`apps/management-web/src/app/ops/admin/layout.tsx`).
- Genuinely consumed on the **public** site, reading the DB on every
  request (no caching/static generation, same rule the Promotion system
  was praised for): `apps/client-web/src/app/(public)/about/page.tsx`
  reads `activeAboutPage()` (falls back to the previous hardcoded copy
  when no page has been published yet — never a blank screen);
  `apps/client-web/src/app/(public)/faq/page.tsx` (new route, linked from
  the site footer) reads `activeFaqEntries()` into a reusable
  `FaqAccordion`; the homepage
  (`apps/client-web/src/app/(public)/page.tsx`) now also renders
  `activeTestimonials()` via `components/content/testimonials-section.tsx`,
  right after the "Why ABIES" section. Each renders nothing (not a
  placeholder) when there's no active content yet — the same empty-state
  rule `PromotionBanner` already follows.

**What works now — Navigation menus, SEO metadata, multi-page content (added, EXPANSION-5 follow-up):**
Same pattern again: domain service + zod schemas + `recordAuditEvent`
(`eventType: 'CONTENT'`) on every create/update/delete, admin routes gated
by `requireAdminMfa` + `requirePermission(ctx, 'configuration.manage')`,
and public pages that read the DB on every request with no caching.

- Additive-only migration
  `packages/domain/prisma/migrations/20261010150000_nav_menu_and_seo/`
  (new enum `NavMenuLocation`, new tables `NavMenuItem` and
  `PageSeoMetadata`, one FK `NavMenuItem.contentPageId → ContentPage.id`
  `ON DELETE CASCADE`; no existing table or column altered). Verified by
  applying the full 41-migration chain to a throwaway `abies_shadow_check`
  database (then `prisma migrate diff` against `schema.prisma`: no
  difference) and dropping it, then applied to the shared dev database
  with `prisma migrate deploy`; `prisma migrate status` reports up to date.
- **Multi-page ContentPage.**
  `packages/domain/src/modules/content/pages.{schemas,service}.ts` —
  list/get/create/update/remove plus public `activeContentPageBySlug()`.
  Slugs are validated (`lowercase-with-hyphens`), unique (409 on clash), and
  immutable after creation since nav links and SEO keys depend on them.
  `about-us`, `terms` and `privacy` map to their existing routes
  (`publicPathForContentPage()`); every other slug is served by the new
  generic route `apps/client-web/src/app/(public)/pages/[slug]/page.tsx`
  (404 when missing/unpublished; a dedicated slug there permanently
  redirects to its canonical route). `/terms` and `/privacy` now render
  admin-published policy text when a `terms`/`privacy` page is active,
  replacing the "pending legal review" notice while still listing the live
  consent artifacts. Admin routes:
  `apps/platform-api/src/app/api/v1/admin/content/pages/route.ts` +
  `[id]/route.ts`. Admin UI: `pages-manager.tsx` (list, create with
  slug, edit, publish/unpublish, remove, one-click "write /terms copy"
  shortcuts for any dedicated slug not created yet). The old
  `/admin/content/about` PUT endpoint is kept for API compatibility but the
  UI no longer uses it.
- **Navigation menus.** Model `NavMenuItem` (`location`, `label`, exactly
  one of `href` or `contentPageId`, `priority`, `active`). Five locations,
  one per link list the public site actually draws: `PUBLIC_HEADER`
  (main nav + mobile drawer), `PUBLIC_TOP_BAR` (support links strip),
  `PUBLIC_FOOTER_CARE`/`_HELP`/`_COMPANY` (footer columns). Deliberately
  flat — no parent/child — since none of those lists has a dropdown.
  `href` must be a site path or `https://` URL (`javascript:`, `data:`,
  `http:` and protocol-relative `//host` rejected). A link to a content page
  is hidden automatically while that page is unpublished and is removed with
  it (cascade; the page's DELETED audit event records how many links went).
  Service: `packages/domain/src/modules/content/nav.{schemas,service}.ts`.
  Fallback rule: a location with **no rows at all** serves the previous
  hardcoded links (`DEFAULT_NAV_MENUS`), so a fresh DB never has an empty
  header; once a location has any row, only admin rows are served.
  Admin routes: `.../admin/content/nav/route.ts` + `[id]/route.ts`. Admin UI:
  `nav-manager.tsx` (per-location lists, add/edit/hide/remove, up/down
  reorder, link-to-URL or link-to-content-page, and "Start from these
  defaults" which copies the built-in links into editable rows). Public
  consumption: `apps/client-web/src/components/layouts/site-header.tsx` and
  `site-footer.tsx` now read `activeNavMenus()` on every request instead of
  hardcoded arrays.
- **SEO metadata.** Model `PageSeoMetadata` (`pageKey` unique, `title`,
  `description`, `keywords[]`, `ogImageKey`, `active`, `createdByUserId`).
  `pageKey` is one of the 12 public routes registered in
  `packages/domain/src/modules/content/seo.pages.ts` (home, about, faq,
  doctors, diagnostics, medicines, panchakarma, contact, support, partners,
  terms, privacy — each with a built-in default title/description) or
  `page:<slug>` for a `/pages/<slug>` content page (default derived from the
  page's own title and body). Service:
  `.../content/seo.{schemas,service}.ts`; `resolvePageSeo()` always returns
  a complete title + description (active row → caller fallback → registry
  default → site default) — never blank. OG image upload uses the same
  `putObject`/magic-byte check as Testimonial photos, served via a 24-hour
  signed URL (crawlers fetch `og:image` some time after the page).
  Admin routes: `.../admin/content/seo/route.ts` + `[id]/route.ts`
  (multipart, like Testimonials). Admin UI: `seo-manager.tsx` (one row per
  public page showing what's live, Customise/Edit, Reset to default).
  Public consumption: all 12 registered pages plus `/pages/[slug]` now
  export `generateMetadata()` via `apps/client-web/src/lib/seo.ts`
  (`pageMetadata()`), emitting title, description, keywords, Open Graph and
  Twitter card tags. It calls `connection()` first so the lookup never runs
  in a build-time prerender. Doctor profile pages (`/doctors/[slug]`) are
  not covered — they're per-entity, not per-page, metadata.
- Tests: `tests/integration/content-nav-seo.test.ts` (14 cases, against
  the real dev DB, cleaning up after itself) — CRUD + audit rows for each
  model, slug/href/pageKey validation, nav target switching, priority
  ordering and hiding rules, page-delete cascade, default-fallback rule,
  OG image upload/clear, never-blank SEO resolution.

**What's still missing/deferred (not accidentally skipped):**
- ❌ No blog — still absent; wasn't asked for.
- ❌ No general multilingual *content* management (copy/translations) —
  only Promotion's banner-targeting flag, unchanged.
- ❌ No promotional video/creative library beyond the two image slots on
  `Promotion` and the per-page OG image, unchanged.
- Nav menus cover the public client-web site only. The portal sidebars
  (patient/doctor/partner/admin) remain code-defined — they're permission-
  driven app navigation, not marketing content.
- ContentPage bodies are plain text (blank line = paragraph). No rich-text
  editor, by design — no HTML injection surface.

**Verdict:** About Us, FAQ, Testimonials, arbitrary static pages, header/
footer navigation and per-page SEO metadata are now all real, admin-
editable, end-to-end CMS features on the same proven Promotion pattern.
What remains (blog, translations, video library) was never requested.

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

## RBAC — 🟡 Partial, improved: SUPER_ADMIN and FINANCE now have real grants; CRM roles still out of scope

Updated after a scoped pass closing part of this gap (SUPER_ADMIN parity +
narrow FINANCE access). The rest of the gap this section originally
described — `CRM_ADMIN`/`SALES_MANAGER`/`MARKETING`/`AUDITOR` having no
foothold in the main admin portal — is unchanged and was explicitly out of
scope for that pass.

- `requireAdminMfa()` (`packages/domain/src/server/rbac.ts`) is still the
  gate on essentially every admin route in this report, but it now checks
  `requireRole(ctx, 'ADMIN', 'SUPER_ADMIN')` **plus** MFA. `SUPER_ADMIN` has
  the identical permission array to `ADMIN` in
  `packages/domain/src/server/permissions.ts`'s `ROLE_PERMISSIONS`
  (`['promotion.manage', 'configuration.manage', 'settlement.manage',
  'hospital.manage']`), so it is ADMIN-equivalent everywhere `requireAdminMfa`
  or `requirePermission` is checked — no route-by-route change was needed
  for this to ripple, since `requireAdminMfa` is the single shared gate.
- `FINANCE` now has a real, narrow grant: `['settlement.manage']` only — not
  `promotion.manage`/`configuration.manage`/`hospital.manage`. A new helper,
  `requireMfaPermission(ctx, permission)` (`rbac.ts`), checks the permission
  and then MFA (mirroring `requireAdminMfa`'s shape) without requiring the
  `ADMIN`/`SUPER_ADMIN` role. The following routes were switched from
  `requireAdminMfa` (or `requireAdminMfa` + a redundant `requirePermission`)
  to `requireMfaPermission(ctx, 'settlement.manage')`, which is how FINANCE
  reaches them while every non-finance admin route stays
  `ADMIN`/`SUPER_ADMIN`-only:
  - `apps/platform-api/src/app/api/v1/admin/settlement/fee-terms/route.ts` (GET, POST)
  - `apps/platform-api/src/app/api/v1/admin/settlement/fee-terms/[id]/route.ts` (PATCH, DELETE)
  - `apps/platform-api/src/app/api/v1/admin/settlement/payouts/[id]/mark-paid/route.ts` (POST)
  - `apps/platform-api/src/app/api/v1/admin/settlement/payouts/[id]/mark-failed/route.ts` (POST)
  - `apps/platform-api/src/app/api/v1/admin/settlement/payouts/[id]/reconciliation/route.ts` (POST)
  - `apps/platform-api/src/app/api/v1/admin/settlement/settlements/route.ts` (GET, POST)
  - `apps/platform-api/src/app/api/v1/admin/settlement/settlements/[id]/complete/route.ts` (POST)
  - `apps/platform-api/src/app/api/v1/admin/settlement/settlements/[id]/generate-payouts/route.ts` (POST)
  - `apps/platform-api/src/app/api/v1/admin/settlement/settlements/[id]/lock/route.ts` (POST)
  - `apps/platform-api/src/app/api/v1/admin/refunds/route.ts` (GET)
  - `apps/platform-api/src/app/api/v1/admin/refunds/[id]/approve/route.ts` (POST)
  - `apps/platform-api/src/app/api/v1/admin/refunds/[id]/reject/route.ts` (POST)

  `admin/staff` (role/account creation, including minting other admins) was
  deliberately **left on `requireAdminMfa`** — it's ADMIN/SUPER_ADMIN-only by
  design, not finance-scoped work, even though it's adjacent to "who can do
  what."
- **Known pre-existing gap, surfaced but not fixed by this pass:** session
  creation (`packages/domain/src/server/session.ts`, `createSession`) only
  requires MFA when `input.role === 'ADMIN'` literally
  (`needsMfa = input.role === 'ADMIN' && env.ADMIN_MFA_REQUIRED`). A
  `SUPER_ADMIN` or `FINANCE` session is created with `mfaVerified: true`
  from the start, regardless of whether MFA was actually completed — so
  `requireAdminMfa`'s and `requireMfaPermission`'s MFA check passes
  trivially for these two roles today. This predates this pass (the MFA
  gate on the role check was already there; this pass only extended which
  roles reach that gate) but is now more consequential, since SUPER_ADMIN
  and FINANCE are real, reachable roles rather than empty-permission dead
  ends. Session-creation MFA enrollment for these roles needs its own
  decision and change — out of scope here since it's outside
  `rbac.ts`/`permissions.ts`.
- A `UserRole` enum does have many values —
  `PATIENT, DOCTOR, ADMIN, LAB, PHARMACY, PANCHAKARMA_CENTRE,
  CUSTOMER_SUPPORT, TECH_SUPPORT, SALES, CARE_COORDINATOR, CRM_ADMIN,
  SALES_MANAGER, MARKETING, AUDITOR, FINANCE, SUPER_ADMIN`
  (`packages/domain/prisma/schema.prisma`) — but per
  `packages/domain/src/server/permissions.ts`, `CRM_ADMIN`, `SALES_MANAGER`,
  `MARKETING`, and `AUDITOR` are still **unchanged, empty-permission** roles
  with respect to this vocabulary, and still don't satisfy
  `requireAdminMfa`'s role check. They remain meaningful only inside the
  separate CRM RBAC layer (`modules/crm/rbac.ts`) — this is by design, not
  an oversight, and was explicitly out of scope for this pass.
- `requirePermission()` (`rbac.ts`, `permissions.ts`) is still the additive
  finer-grained check its own comment describes — a static, role-keyed
  vocabulary, not yet DB-backed/admin-editable. `ADMIN` and `SUPER_ADMIN`
  hold all four permissions that exist; `FINANCE` holds exactly one
  (`settlement.manage`); everyone else in this vocabulary holds the same
  set as before.

**Verdict:** improved but still partial. `SUPER_ADMIN` is now a genuine
ADMIN-equivalent super-admin role, and `FINANCE` is now a genuine (if
narrow) finance sub-admin role scoped to settlement/payout/refund routes —
this is the first real sub-role separation in the main admin portal. There
is still no Product Manager / Doctor Manager / Marketing / Support
admin-role separation, and the CRM roles remain a *parallel* unrelated RBAC
system by design.

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
   *(Update: since done — About Us/FAQ/Testimonials, then nav menus, SEO
   metadata and multi-page content; see §E. Blog is still not built.)*

5. **RBAC sub-roles** (Super Admin/Product Manager/Finance/etc.) is real
   work the platform will eventually need, but every module above is
   currently gated by a single `ADMIN` role check — adding sub-roles without
   first having real per-module write paths (A–D) to gate would be designing
   permissions for capabilities that don't exist yet. This should follow,
   not lead, the module build-out.
