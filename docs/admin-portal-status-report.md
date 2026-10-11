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

## E. Website & Mobile App Content Management — ✅ Website CMS complete for what was asked (pages, blog, nav, SEO, FAQ, testimonials, banners); CMS content translatable to Hindi (UI chrome is not); video tracked separately

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
  `pageKey` is one of the 13 public routes registered in
  `packages/domain/src/modules/content/seo.pages.ts` (home, about, faq,
  doctors, diagnostics, medicines, panchakarma, blog (added by the blog
  pass), contact, support, partners, terms, privacy — each with a built-in
  default title/description) or
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
  Public consumption: all 13 registered pages plus `/pages/[slug]` now
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

**What works now — Blog (added, EXPANSION-5 blog pass):**
Same pattern as `ContentPage`, plus the fields a dated, bylined article
needs.

- Additive-only migration
  `packages/domain/prisma/migrations/20261010170000_blog_post/` (one new
  table `BlogPost`, unique index on `slug`, index on `(active,
  publishedAt)`; nothing existing altered). Model fields: `slug` (unique,
  same lowercase-with-hyphens rule as ContentPage, immutable after
  creation), `title`, `excerpt` (list/summary + SEO description), `body`
  (plain text, blank line = paragraph — no rich-text editor, same as
  ContentPage), `coverImageKey` (optional), `authorName` (public byline),
  `createdByUserId` (plain id of the admin who created it — the
  `Testimonial` precedent), `publishedAt` (nullable — **null = draft**,
  kept separate from `createdAt`; a future date = scheduled, goes live on
  its own with no job), `active` (hide a published post without losing its
  date), timestamps. Verified by applying the full 45-migration chain to a
  throwaway `abies_shadow_check_blog` database (`prisma migrate diff`
  against `schema.prisma`: no difference) and dropping it, then applied
  **only this migration** to the shared dev database (`prisma db execute`
  + `prisma migrate resolve --applied`, so another workstream's pending
  migration wasn't swept in).
- Service: `packages/domain/src/modules/content/blog.{schemas,service}.ts`
  — list/get/create/update/remove plus public `publishedBlogPosts()`
  (newest first, no body) and `publishedBlogPostBySlug()`. Visible to the
  public only when `active` and `publishedAt <= now`; draft, scheduled,
  hidden and missing all 404 identically. `recordAuditEvent`
  (`eventType: 'CONTENT'`) on every write, with dedicated `PUBLISHED` /
  `UNPUBLISHED` actions when `publishedAt` is set/cleared (otherwise
  `UPDATED`). Cover image: same `putObject` + magic-byte
  `assertUploadAllowed` + replace-then-delete flow as Testimonial photos,
  stored under `blog/<id>/`, with a clear-image option like SEO's OG image.
- Admin routes (`requireAdminMfa` + `requirePermission(ctx,
  'configuration.manage')`, multipart `payload` + `coverImage`):
  `apps/platform-api/src/app/api/v1/admin/content/blog/route.ts` +
  `[id]/route.ts`. Admin UI: new "Blog" tab,
  `apps/management-web/src/app/ops/admin/content/blog-manager.tsx` (list
  with Draft/Scheduled/Published/Hidden status, create/edit with cover
  upload/replace/remove, optional publish date, one-click Publish now /
  Unpublish, Hide/Show, Remove).
- Public, read live on every request (`force-dynamic`):
  `apps/client-web/src/app/(public)/blog/page.tsx` (list) and
  `.../blog/[slug]/page.tsx` (detail, plain-text body via the existing
  `ContentPageBody`). SEO: `/blog` is a new `blog` entry in `SEO_PAGES`, so
  its metadata is admin-editable in the existing SEO tab via
  `pageMetadata('blog')`; each post's `generateMetadata()` uses
  `blogPostMetadata()` in `apps/client-web/src/lib/seo.ts` — title,
  excerpt as description, author, Open Graph `article` with
  published/modified time, cover image as `og:image` (24-hour signed URL,
  same reasoning as the OG image TTL).
- Nav: "Blog" added to the built-in `PUBLIC_FOOTER_COMPANY` defaults in
  `nav.schemas.ts` rather than as a DB row — a single admin row in an
  unconfigured location would replace that location's entire default list
  (the fallback rule above). Admins who already customised that column add
  it with an ordinary `/blog` URL item.
- Tests: `tests/integration/blog.test.ts` (8 cases, real dev DB, cleans up
  after itself) — CRUD + audit rows, PUBLISHED/UNPUBLISHED audit actions,
  duplicate/malformed/immutable slug, ISO `publishedAt` parsing, cover
  upload/keep/replace/clear, public visibility (draft/scheduled/hidden
  excluded, newest first), detail lookup with signed cover URL.

**What works now — CMS content translations, English + Hindi (added, EXPANSION-5 translations pass):**

> **Scope, stated plainly: this translates admin-managed CMS *content*
> only — never the application's own UI.** What an admin can now publish
> in Hindi: content-page title/body (About Us, Terms, Privacy, any
> `/pages/<slug>` page), FAQ question/answer pairs, testimonial quote /
> author name / role, header/footer nav link labels, and per-page SEO
> title/description/keywords. Everything else on the public site — every
> button, heading, form label, empty state, error message and hardcoded
> marketing copy in client-web, plus all of partner-web and
> management-web — is still English-only. A Hindi visitor sees Hindi CMS
> text inside English page chrome. Translating the UI itself would be a
> separate, much larger i18n-framework project (message catalogues, a
> `[locale]` route segment or equivalent, hundreds of components) and has
> **not** been started. The blog and the media library are also not
> covered.

- **Architecture — a `language` column on each model, one row per
  language (option (a)), not a polymorphic `Translation` table.** Every
  other model in `schema.prisma` is a typed, directly-queryable table with
  real foreign keys; a generic `entityType/entityId/field/value` table
  would have had no FK to its entity (no cascade, orphans possible),
  stringly-typed field names, and every public read would have needed an
  overlay merge. Refinement on (a): each translation row also carries
  `translationOfId` → the English row it translates (self-relation,
  `ON DELETE CASCADE`, `@@unique([translationOfId, language])`). Without
  that link a list (FAQ, testimonials, a nav menu) could only fall back
  *as a whole* — translating 2 of 10 FAQs would either show 2 Hindi
  questions and drop 8, or show none. With it, fallback is **per item**,
  order/priority stays the English list's, and deleting an English row
  removes its translations.
- **What a translation row owns vs. inherits.** It owns only its text
  columns and its own `active` (draft) flag. Ordering, photo/video,
  rating, link target (`href`/`contentPageId`), nav location, OG image,
  and whether the item is published at all come from the English row —
  unpublishing the English item hides it in every language; a draft
  translation falls back to English.
- Migration `packages/domain/prisma/migrations/20261010180000_content_translations/`:
  adds `language TEXT NOT NULL DEFAULT 'en'` + `translationOfId` (FK,
  cascade) + the per-language unique index to `ContentPage`, `FaqEntry`,
  `Testimonial`, `NavMenuItem`, `PageSeoMetadata`. **Not purely
  additive in one respect:** `ContentPage.slug` and
  `PageSeoMetadata.pageKey` change from unique to unique-per-language
  (`@@unique([slug, language])`, `@@unique([pageKey, language])`) so a
  translation can share its English row's slug/key. That only relaxes a
  constraint — all existing rows are `'en'` — and the composite index is
  created before the old one is dropped. Verified by applying the full
  migration chain to a throwaway `abies_shadow_i18n` database
  (`prisma migrate diff` against `schema.prisma`: no difference), dropping
  it, then applying **only this migration** to the shared dev database
  (`prisma db execute` + `prisma migrate resolve --applied`).
- Languages: `packages/domain/src/modules/content/languages.ts` —
  `CONTENT_LANGUAGES = ['en', 'hi']` (the same pair the notification
  templates already carry bodies for), labels in each language's own
  script, the shared per-item fallback rule `localise()`, and the cookie
  name. Adding a language later is a one-line change here (the column is
  plain text, not an enum).
- Services: each of `pages`, `faq`, `testimonials`, `nav`, `seo` gained
  `upsert…Translation(sourceId, {language, …text})` (create-or-replace,
  `CREATED`/`UPDATED` audit event with `translationOf` + `language`) and
  `remove…Translation(sourceId, language)`. Admin `list…()` returns
  English rows only, each with a nested `translations` array; the
  ordinary update functions refuse a translation row's id (it can't be
  given its own href/priority/photo). Public resolvers
  (`activeContentPageBySlug`, `activeAboutPage`, `activeFaqEntries`,
  `activeTestimonials`, `activeNavMenus`/`resolveNavItems`,
  `resolvePageSeo`) take an optional `language` (default `'en'`, so every
  existing caller is unchanged) and report the language actually served
  per item. SEO falls back to the English keywords when a translation
  leaves them blank; nav's built-in defaults (unconfigured location)
  stay English.
- Admin routes (same `requireAdminMfa` + `configuration.manage` gate):
  `apps/platform-api/src/app/api/v1/admin/content/{pages,faq,testimonials,nav,seo}/[id]/translations/route.ts`
  — `PUT` (body includes `language`) and `DELETE ?language=hi`, where
  `[id]` is the English row.
- Admin UI: one shared
  `apps/management-web/src/app/ops/admin/content/translations-control.tsx`
  used by all five managers — under each English item it shows the
  Hindi status ("Translated" / "Draft — English shown" / "Not translated —
  English shown") and a Translate/Edit button opening a form with a
  Language selector, the translatable fields (each with the English text
  shown for reference), a Published checkbox, and Remove translation. SEO
  translations hang off a customised English row, so a page still on
  built-in defaults says "Customise this page to add translated metadata."
- Public site: a language dropdown (English / हिन्दी) in the header's top
  bar, `apps/client-web/src/components/layouts/language-switcher.tsx`.
  No existing visitor-preference mechanism existed to reuse (no
  `[locale]` segment, no `Accept-Language` handling, no preference
  cookie — only the session cookie and a sessionStorage error-correlation
  id), so it sets a first-party `abies_content_lang` cookie (1 year,
  `SameSite=Lax`) and calls `router.refresh()`; server components read it
  via `apps/client-web/src/lib/content-language.ts` on every request.
  A cookie rather than per-language URLs because only CMS text varies —
  URLs, routing and UI chrome don't. Wired into `/about`, `/faq`,
  `/terms`, `/privacy`, `/pages/[slug]`, the homepage testimonials, the
  header/footer nav, and `pageMetadata()` SEO. Rendered CMS text carries
  a `lang` attribute for the language actually served (so screen readers
  pronounce Hindi correctly even when mixed with English fallbacks).
  Crawlers send no cookie, so search engines index the English version.
- Tests: `tests/integration/content-translations.test.ts` (11 cases, real
  dev DB, cleans up after itself) — creating/updating a translation and
  its audit rows, nested admin listing, translation-of-a-translation and
  editing-a-translation-as-English refused, per-item English fallback
  (untranslated and draft translations) with English ordering preserved,
  English unpublish hiding all languages, cascade on delete for FAQ and
  pages (audit records `translationsRemoved`), testimonial/nav/SEO
  translation serving, and an end-to-end switcher test: render the real
  `/faq` page, change the real `LanguageSwitcher` to हिन्दी, re-render —
  the Hindi question replaces the English one and the untranslated entry
  stays English.

**What's still missing/deferred (not accidentally skipped):**
- **Application UI is not translated** — see the scope note above. Only
  CMS content has a Hindi version; nothing in partner-web or
  management-web, and no static client-web UI string, is translated.
- Blog posts and media-library items are English-only (separate
  workstreams; the same `language` + `translationOfId` pattern would
  extend to `BlogPost` if wanted). Promotion banners keep their separate
  `targetLanguages` audience-targeting flag, which is not a translation of
  the banner's text.
- The switcher does not read `Accept-Language` or a logged-in patient's
  `preferredLanguage`; every visitor starts in English until they choose.
- Nav menus cover the public client-web site only. The portal sidebars
  (patient/doctor/partner/admin) remain code-defined — they're permission-
  driven app navigation, not marketing content.
- ContentPage bodies are plain text (blank line = paragraph). No rich-text
  editor, by design — no HTML injection surface.

**Verdict:** About Us, FAQ, Testimonials, arbitrary static pages, header/
footer navigation and per-page SEO metadata are now all real, admin-
editable, end-to-end CMS features on the same proven Promotion pattern.
The blog is now real on the same pattern too (drafts, scheduled
publishing, cover images, per-post SEO). Admins can now also publish a
Hindi version of pages, FAQ, testimonials, nav labels and SEO metadata,
with a public language switcher and per-item English fallback — **CMS
content only; the site's UI itself remains English.** The video/media
library is tracked as its own separate workstream.

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

## Media Library — ✅ Real admin library with image + video support (first integration: Testimonials)

The original finding still holds for the foundation: one generic
S3/MinIO adapter (`packages/domain/src/lib/storage.ts`) that every module's
files go through. What was missing — a library an admin can browse, search
and reuse from, and any upload path that accepted video — now exists, built
on top of that adapter rather than beside it.

**What works now:**
- **`MediaAsset` model** (migration `20261010190000_media_library`):
  storage key, original filename, MIME type, `kind` (`IMAGE`/`VIDEO`),
  byte size, width/height (images), `durationSeconds` (video, best-effort),
  `uploadedByUserId`, `createdAt`. Flat library — no folders/tags; search is
  filename (case-insensitive substring) + kind filter, newest first.
- **Accepted types and limits.** Images: JPEG/PNG (what testimonial/
  promotion photos already take) plus WebP (already accepted for product
  images), capped at `UPLOAD_MAX_BYTES` (10 MB default) — same as the
  bespoke photo paths. Video: **MP4 and WebM, capped at 50 MB**
  (`MEDIA_VIDEO_MAX_BYTES`, `modules/media/media.schemas.ts`). Every type has
  a magic-byte check in `storage.ts` (`assertUploadAllowed`) — WebP, MP4
  (`ftyp`) and WebM (EBML header) signatures were added there, per that
  file's own rule. Rejections come back as 400s, not 500s.
- **Video-sized request bodies, end to end.** `putObject` itself has no size
  assumption, but two layers in front of it did: Next's proxy body buffer
  (`src/proxy.ts` matches every route, and Next **silently truncates** a
  buffered body past 10 MB by default) and nginx's server-wide
  `client_max_body_size 12m`. `apps/platform-api/next.config.mjs` now sets
  `experimental.proxyClientMaxBodySize: '55mb'`, and `infra/nginx/abies.conf`
  has an exact-match `location = /api/v1/admin/media` with
  `client_max_body_size 55m`. Every other route keeps nginx's 12m cap.
  **Not done:** the RKE2/Envoy Gateway path (UAT/prod gitops repo) isn't in
  this repo — any body-size limit there needs the same 55 MB allowance for
  that one route.
- **Metadata extraction, no new dependency** (`modules/media/media-probe.ts`):
  image width/height from the PNG/JPEG/WebP headers; MP4 duration from
  `moov/mvhd`. **WebM duration is left null** — the element is optional
  (browser MediaRecorder output usually omits it) and reading it means a
  real EBML parser.
- **Admin API** (all `requireAdminMfa` + `configuration.manage`):
  `GET/POST /api/v1/admin/media` (list/search/paginate; multipart `file`
  upload), `GET/DELETE /api/v1/admin/media/[id]`, and
  `GET /api/v1/admin/media/[id]/file` (streams the object, Range-capable).
- **Delete policy: hard delete, only when unreferenced.** Row and stored
  object go together; an asset referenced by a testimonial returns 409 with
  how many rows use it (FKs are `onDelete: Restrict` as the backstop).
  "Remove from library but keep the object" was rejected — the library is
  the only index of `media/...` keys, so that would just create orphans.
- **Admin UI:** `/ops/admin/content?tab=media` — thumbnail grid (images
  as images; videos as a first-frame poster via `#t=0.1` + play badge),
  filename/size/dimensions/duration, search, type filter, upload, load-more
  pagination, delete with confirmation. The same component doubles as a
  picker (`media-picker-field.tsx`), and the picker can upload inline.
- **Reuse, proven on Testimonials:** a testimonial's photo can be uploaded
  fresh (existing path, unchanged) **or** chosen from the library
  (`Testimonial.photoAssetId`), and a testimonial can carry a **video**
  (`Testimonial.videoAssetId`, library-only). Modeled as FKs to
  `MediaAsset`, not as a copied key, because the testimonial owns and
  deletes its own `photoKey` upload but must never delete a shared library
  object. Switching between an uploaded photo and a library photo deletes
  only the old *upload*. The public homepage renders the video with
  native `<video controls>`.
- **Serving video:** public testimonial videos are served from
  `/api/v1/public/testimonials/[id]/video` (active English testimonials
  only, so the route can't read arbitrary library objects), streamed with
  HTTP Range support via a new `getObjectStream()` in `storage.ts` —
  Safari won't play a `<video>` whose source can't answer Range requests,
  and `getObjectBytes()` would buffer the whole file in memory. No
  transcoding/adaptive streaming: the original upload is what's served.
- **Tests:** `tests/integration/media.test.ts` (11 cases, real dev DB +
  MinIO) — image/MP4/WebM upload + metadata, type/content/size rejections,
  search/kind filter/pagination, 206/416 range responses, delete
  (object removed), testimonial created from library photo + video,
  in-use delete → 409, testimonial removal leaves library objects intact,
  upload↔library photo swap, wrong-kind/missing/contradictory refs.

**Still not done:**
- Only Testimonials is wired to the library. Promotions, product images,
  SEO OG images and blog covers still use their own bespoke upload paths
  (the picker component is reusable; each needs its own `*AssetId` FK).
- No folders, tags, alt-text or rename. No "where is this used" view
  beyond the 409 message.
- **Pre-existing, not introduced here:** existing public images
  (testimonial/promotion photos, SEO OG image) are served as signed URLs
  pointing at `STORAGE_ENDPOINT` (`http://minio:9000` in compose), while
  every app's CSP allows only `'self'` for images. Library *videos* and the
  admin library previews avoid this by streaming same-origin; library
  *photos* on testimonials deliberately kept the existing signed-URL
  behaviour so both photo sources render the same way. Worth fixing for all
  of them together (same-origin streaming or a public storage host + CSP).

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
