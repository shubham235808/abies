import Image from 'next/image';
import Link from 'next/link';
import { CartButton } from '@/components/cart/cart-button';
import { activeNavMenus } from '@abies/domain/modules/content/nav.service';
import { myCartItemCount } from '@abies/domain/modules/medicines/cart.service';
import { getCurrentSession } from '@abies/domain/server/current-user';
import { PORTAL_PATH } from '@abies/design-system/components/auth/portal-paths';
import { MobileNav } from '@abies/design-system/layouts/mobile-nav';
import { NavLinks } from './nav-links';

export async function SiteHeader() {
  const session = await getCurrentSession();
  const isPatient = session?.user.role === 'PATIENT';
  const [cartCount, nav] = await Promise.all([
    isPatient ? myCartItemCount(session.userId) : Promise.resolve(0),
    activeNavMenus(['PUBLIC_HEADER', 'PUBLIC_TOP_BAR']),
  ]);

  return (
    <header className="sticky top-0 z-30">
      <div className="bg-gradient-to-r from-brand-purple-500 to-brand-magenta-500 text-xs text-white">
        <div className="mx-auto flex min-h-[34px] max-w-6xl items-center justify-between gap-4 px-6">
          <span>Verified practitioners · Coordinated Ayurveda care</span>
          <div className="hidden gap-4 sm:flex">
            {nav.PUBLIC_TOP_BAR.map((item) => (
              <Link key={item.key} href={item.href} className="opacity-90 hover:opacity-100">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-brand-neutral-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[78px] max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <Image src="/abies-mark.png" alt="" width={44} height={44} priority className="rounded-control" />
            <div className="hidden flex-col sm:flex">
              <strong className="text-[17px] leading-tight text-brand-neutral-900">ABIES</strong>
              <span className="text-[11px] text-brand-neutral-500">Integrated care platform</span>
            </div>
          </Link>

          <NavLinks items={nav.PUBLIC_HEADER} />

          <div className="flex shrink-0 items-center gap-2.5">
            <CartButton initialCount={cartCount} />
            {session ? (
              <Link
                href={PORTAL_PATH[session.user.role] ?? '/'}
                className="rounded-control bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 px-3.5 py-2 text-sm font-bold text-white shadow-[0_8px_22px_rgba(166,10,128,0.18)]"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-control border border-brand-neutral-200 bg-white px-3.5 py-2 text-sm font-bold text-brand-purple-700 sm:inline-block"
                >
                  Login
                </Link>
                <Link
                  href="/doctors"
                  className="hidden rounded-control bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 px-3.5 py-2 text-sm font-bold text-white shadow-[0_8px_22px_rgba(166,10,128,0.18)] sm:inline-block"
                >
                  Book consultation
                </Link>
              </>
            )}
          </div>
        </div>
        <MobileNav nav={nav.PUBLIC_HEADER} />
      </div>
    </header>
  );
}
