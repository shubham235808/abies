import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { UserRole } from '@prisma/client';
import { getCurrentSession } from '@abies/domain/server/current-user';
import { LogoutButton } from './logout-button';
import { MobileNav } from './mobile-nav';
import { PortalSidebarNav } from './portal-sidebar-nav';

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
    <div className="min-h-screen bg-[#f8f6f9]">
      <header className="sticky top-0 z-10 border-b border-brand-neutral-100 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/abies-mark.png" alt="" width={28} height={28} className="rounded-control" />
              <span className="font-extrabold text-brand-purple-700">ABIES</span>
            </Link>
            <span className="rounded-pill bg-brand-purple-500/[0.07] px-2.5 py-1 text-xs font-bold text-brand-purple-700">
              {portalLabel}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-brand-neutral-500 sm:inline">{session.user.mobile}</span>
            <LogoutButton />
          </div>
        </div>
        <MobileNav nav={nav} />
      </header>

      <div className="mx-auto flex max-w-6xl gap-5 px-4 py-5 sm:px-6">
        <aside className="sticky top-[90px] hidden h-max w-[240px] shrink-0 rounded-card border border-brand-neutral-200 bg-white p-[15px] md:block">
          <PortalSidebarNav nav={nav} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
