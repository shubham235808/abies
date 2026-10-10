// The public client-web pages whose metadata is admin-editable, with the
// defaults each falls back to when no active PageSeoMetadata row exists.
// Kept free of server imports so the admin UI can list the same pages and
// show the live defaults.
export interface SeoPageDefinition {
  key: string;
  path: string;
  label: string;
  defaultTitle: string;
  defaultDescription: string;
}

export const SITE_DEFAULT_TITLE = 'ABIES — Ayurveda Care Platform';
export const SITE_DESCRIPTION =
  'A trusted digital care network connecting patients, verified Ayurveda practitioners, diagnostics, medicines and Panchakarma services through one coordinated treatment journey.';

export const SEO_PAGES: readonly SeoPageDefinition[] = [
  { key: 'home', path: '/', label: 'Home', defaultTitle: SITE_DEFAULT_TITLE, defaultDescription: SITE_DESCRIPTION },
  {
    key: 'about',
    path: '/about',
    label: 'About',
    defaultTitle: 'About ABIES',
    defaultDescription:
      'ABIES is a care-orchestration network connecting patients with verified Ayurveda practitioners and the partners who fulfil their care plan.',
  },
  {
    key: 'faq',
    path: '/faq',
    label: 'FAQ',
    defaultTitle: 'FAQ — ABIES',
    defaultDescription: 'Answers to common questions about consultations, diagnostics, medicines and Panchakarma on ABIES.',
  },
  {
    key: 'doctors',
    path: '/doctors',
    label: 'Find a doctor',
    defaultTitle: 'Find a verified Ayurveda doctor — ABIES',
    defaultDescription: 'Browse registration-verified Ayurveda practitioners and book an in-clinic or video consultation.',
  },
  {
    key: 'diagnostics',
    path: '/diagnostics',
    label: 'Diagnostics',
    defaultTitle: 'Diagnostics — ABIES',
    defaultDescription: 'Book lab tests and health packages from verified diagnostic partners, with home sample collection where available.',
  },
  {
    key: 'medicines',
    path: '/medicines',
    label: 'Medicines',
    defaultTitle: 'Medicines — ABIES',
    defaultDescription: 'Order Ayurvedic medicines from verified partner pharmacies, fulfilled against your practitioner’s care plan.',
  },
  {
    key: 'panchakarma',
    path: '/panchakarma',
    label: 'Panchakarma',
    defaultTitle: 'Panchakarma — ABIES',
    defaultDescription: 'Discover Panchakarma therapies at verified centres and book sessions coordinated with your practitioner.',
  },
  {
    key: 'contact',
    path: '/contact',
    label: 'Contact',
    defaultTitle: 'Contact us — ABIES',
    defaultDescription: 'Get in touch with the ABIES team — no account needed.',
  },
  {
    key: 'support',
    path: '/support',
    label: 'Support',
    defaultTitle: 'Support — ABIES',
    defaultDescription: 'Customer, sales and technical support for patients and partners on ABIES.',
  },
  {
    key: 'partners',
    path: '/partners',
    label: 'Partners',
    defaultTitle: 'Partner with ABIES',
    defaultDescription: 'Join ABIES as a practitioner, diagnostic lab, pharmacy or Panchakarma centre.',
  },
  {
    key: 'terms',
    path: '/terms',
    label: 'Terms of Service',
    defaultTitle: 'Terms of Service — ABIES',
    defaultDescription: 'The terms that govern use of the ABIES care platform.',
  },
  {
    key: 'privacy',
    path: '/privacy',
    label: 'Privacy Notice',
    defaultTitle: 'Privacy Notice — ABIES',
    defaultDescription: 'How ABIES collects, uses and protects your personal and health data.',
  },
];

const CONTENT_PAGE_SEO_KEY = /^page:[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function seoKeyForContentPage(slug: string): string {
  return `page:${slug}`;
}

export function isValidSeoPageKey(key: string): boolean {
  return SEO_PAGES.some((p) => p.key === key) || CONTENT_PAGE_SEO_KEY.test(key);
}

export function seoPageDefinition(key: string): SeoPageDefinition | undefined {
  return SEO_PAGES.find((p) => p.key === key);
}

// Default metadata for a /pages/<slug> page with no SEO row: its own title,
// and the opening of its body as the description (search snippets are
// truncated around 160 characters anyway).
export function contentPageSeoFallback(page: { title: string; body: string }): { title: string; description: string } {
  const flat = page.body.replace(/\s+/g, ' ').trim();
  const description = flat.length > 160 ? `${flat.slice(0, 157).trimEnd()}…` : flat;
  return { title: `${page.title} — ABIES`, description: description || SITE_DESCRIPTION };
}
