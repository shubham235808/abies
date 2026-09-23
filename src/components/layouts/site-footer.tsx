import Link from 'next/link';

const COLUMNS = [
  {
    title: 'Platform',
    links: [
      { href: '/doctors', label: 'Find a doctor' },
      { href: '/diagnostics', label: 'Diagnostics' },
      { href: '/medicines', label: 'Medicines' },
      { href: '/panchakarma', label: 'Panchakarma' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/partners', label: 'Partner with ABIES' },
      { href: '/support', label: 'Support' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy notice' },
      { href: '/terms', label: 'Terms of service' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-brand-neutral-200 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-neutral-400">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-brand-neutral-600 hover:text-brand-purple-700">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 border-t border-brand-neutral-100 pt-6 text-xs text-brand-neutral-400">
          © {new Date().getFullYear()} ABIES. A care-coordination platform, not a substitute for
          professional medical judgement.
        </p>
      </div>
    </footer>
  );
}
