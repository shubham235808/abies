import { z } from 'zod';

export const NAV_MENU_LOCATIONS = [
  'PUBLIC_HEADER',
  'PUBLIC_TOP_BAR',
  'PUBLIC_FOOTER_CARE',
  'PUBLIC_FOOTER_HELP',
  'PUBLIC_FOOTER_COMPANY',
] as const;
export type NavMenuLocationKey = (typeof NAV_MENU_LOCATIONS)[number];

export const NAV_MENU_LOCATION_LABELS: Record<NavMenuLocationKey, string> = {
  PUBLIC_HEADER: 'Header — main menu',
  PUBLIC_TOP_BAR: 'Header — top bar',
  PUBLIC_FOOTER_CARE: 'Footer — Care column',
  PUBLIC_FOOTER_HELP: 'Footer — Help column',
  PUBLIC_FOOTER_COMPANY: 'Footer — Company column',
};

export interface NavLink {
  label: string;
  href: string;
}

// What the public site rendered before nav was admin-editable. Served for
// any location that has never had a row created, so a fresh database (or a
// location the admin hasn't touched) keeps a working header/footer rather
// than an empty one. Shared with the admin UI so it can show — and copy —
// exactly what's live.
export const DEFAULT_NAV_MENUS: Record<NavMenuLocationKey, readonly NavLink[]> = {
  PUBLIC_HEADER: [
    { href: '/doctors', label: 'Find a doctor' },
    { href: '/diagnostics', label: 'Diagnostics' },
    { href: '/medicines', label: 'Medicines' },
    { href: '/panchakarma', label: 'Panchakarma' },
    { href: '/about', label: 'About' },
  ],
  PUBLIC_TOP_BAR: [
    { href: '/support', label: 'Customer Support' },
    { href: '/support?type=sales', label: 'Sales' },
    { href: '/support?type=tech', label: 'Tech Help' },
  ],
  PUBLIC_FOOTER_CARE: [
    { href: '/doctors', label: 'Find a doctor' },
    { href: '/diagnostics', label: 'Diagnostics' },
    { href: '/medicines', label: 'Medicines' },
    { href: '/panchakarma', label: 'Panchakarma' },
  ],
  PUBLIC_FOOTER_HELP: [
    { href: '/support', label: 'Customer support' },
    { href: '/support?type=sales', label: 'Sales' },
    { href: '/support?type=tech', label: 'Technical support' },
    { href: '/faq', label: 'FAQ' },
    { href: '/contact', label: 'Contact' },
  ],
  PUBLIC_FOOTER_COMPANY: [
    { href: '/about', label: 'About' },
    { href: '/partners', label: 'Partner with ABIES' },
    { href: '/privacy', label: 'Privacy notice' },
    { href: '/terms', label: 'Terms of service' },
  ],
};

export const navMenuLocationSchema = z.enum(NAV_MENU_LOCATIONS);

// Same threat as Promotion's ctaHref: this renders as a real <a href> for
// every visitor, so javascript:/data: must be impossible. Stricter than
// ctaHref in one way — "//host" is a protocol-relative off-site link that
// merely looks like a relative path, so it's rejected too.
export const navHrefSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((v) => /^\/(?![/\\])/.test(v) || v.startsWith('https://'), {
    message: 'Link must be a site path (e.g. /doctors) or an https:// URL',
  });

const baseNavFields = {
  label: z.string().min(1).max(60),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
};

export const createNavMenuItemSchema = z
  .object({
    location: navMenuLocationSchema,
    href: navHrefSchema.optional(),
    contentPageId: z.string().min(1).optional(),
    ...baseNavFields,
  })
  .refine((v) => Boolean(v.href) !== Boolean(v.contentPageId), {
    message: 'Provide exactly one of a link (href) or a content page',
  });

// null clears a target so an item can switch between "URL" and "content
// page" in one PATCH; the service re-checks exactly-one against the merged
// row.
export const updateNavMenuItemSchema = z.object({
  location: navMenuLocationSchema.optional(),
  label: baseNavFields.label.optional(),
  href: navHrefSchema.nullable().optional(),
  contentPageId: z.string().min(1).nullable().optional(),
  priority: baseNavFields.priority.optional(),
  active: z.boolean().optional(),
});
