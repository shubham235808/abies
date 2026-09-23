import Image from 'next/image';
import Link from 'next/link';

const NAV = [
  { href: '/doctors', label: 'Find a doctor' },
  { href: '/diagnostics', label: 'Diagnostics' },
  { href: '/medicines', label: 'Medicines' },
  { href: '/panchakarma', label: 'Panchakarma' },
  { href: '/about', label: 'About' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-brand-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/abies-mark.png" alt="" width={32} height={32} priority className="rounded-sm" />
          <span className="text-lg font-semibold tracking-tight text-brand-purple-700">ABIES</span>
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-brand-neutral-600 hover:text-brand-purple-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/login"
          className="shrink-0 rounded-lg bg-brand-purple-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-purple-700"
        >
          Sign in
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-brand-neutral-100 px-4 py-2 md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-md px-2.5 py-1 text-sm text-brand-neutral-600 hover:bg-brand-neutral-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
