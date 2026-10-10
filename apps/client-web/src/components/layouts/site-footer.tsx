import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';
import { activeNavMenus } from '@abies/domain/modules/content/nav.service';

const COLUMNS = [
  { title: 'Care', location: 'PUBLIC_FOOTER_CARE' },
  { title: 'Help', location: 'PUBLIC_FOOTER_HELP' },
  { title: 'Company', location: 'PUBLIC_FOOTER_COMPANY' },
] as const;

export async function SiteFooter() {
  // The footer uses no request-time API of its own, so without this a
  // prerender pass would run the nav query at build time, where there is
  // no database.
  await connection();
  const menus = await activeNavMenus(COLUMNS.map((c) => c.location));
  return (
    <footer className="bg-[#211526] text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-9 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Image src="/abies-mark.png" alt="ABIES" width={64} height={64} className="rounded-control bg-white p-1.5" />
            <p className="mt-3.5 max-w-xs text-[13px] text-white/70">
              One coordinated Ayurveda care journey connecting patients, verified practitioners,
              diagnostics, medicines and Panchakarma partners.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 font-semibold">{col.title}</h3>
              {menus[col.location].map((link) => (
                <Link key={link.key} href={link.href} className="my-2 block text-[13px] text-white/70 hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-7 flex flex-col justify-between gap-2 border-t border-white/10 pt-4.5 text-xs text-white/55 sm:flex-row">
          <span>© {new Date().getFullYear()} ABIES. A care-coordination platform, not a substitute for professional medical judgement.</span>
          <span>Privacy · Terms · Consent · Clinical safety</span>
        </div>
      </div>
    </footer>
  );
}
