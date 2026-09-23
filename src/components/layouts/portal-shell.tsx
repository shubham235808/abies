import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { UserRole } from '@prisma/client';
import { getCurrentSession } from '@/server/current-user';
import { LogoutButton } from './logout-button';

export interface PortalNavItem {
  href: string;
  label: string;
}

// Shared shell for every authenticated portal (docs/TARGET-ARCHITECTURE.md:
// "desktop portals use sidebar + header + content, mobile uses a
// responsive drawer/bottom nav" — here: sidebar on md+, horizontal scroll
// nav on mobile). Server Component: the auth/role check runs before any
// portal page renders, so an unauthenticated or wrong-role request never
// sees portal content, not even a flash of it.
export async function PortalShell({
  allowedRoles,
  portalLabel,
  nav,
  requireMfa,
  children,
}: {
  allowedRoles: UserRole[];
  portalLabel: string;
  nav: PortalNavItem[];
  /** Redirect to the MFA step instead of rendering when the session hasn't
   * completed it yet — e.g. the admin portal. Route handlers enforce this
   * independently too (requireAdminMfa); this closes the gap for pages
   * that read data straight from the service layer instead of calling
   * their own API, which would otherwise skip that check entirely. */
  requireMfa?: boolean;
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  if (!allowedRoles.includes(session.user.role)) redirect('/login');
  if (requireMfa && !session.mfaVerified) redirect('/login/mfa');

  return (
    <div className="min-h-screen bg-brand-neutral-50">
      <header className="sticky top-0 z-10 border-b border-brand-neutral-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/abies-mark.png" alt="" width={28} height={28} />
              <span className="font-semibold text-brand-purple-700">ABIES</span>
            </Link>
            <span className="rounded-full bg-brand-purple-50 px-2.5 py-0.5 text-xs font-medium text-brand-purple-700">
              {portalLabel}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-brand-neutral-500 sm:inline">{session.user.mobile}</span>
            <LogoutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-brand-neutral-100 px-4 py-2 sm:px-6 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-brand-neutral-600 hover:bg-brand-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-6xl">
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 border-r border-brand-neutral-200 bg-white p-4 md:block">
          <nav className="space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm text-brand-neutral-700 hover:bg-brand-purple-50 hover:text-brand-purple-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
