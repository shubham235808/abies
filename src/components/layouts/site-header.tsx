import Image from 'next/image';
import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-brand-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/abies-mark.png" alt="" width={32} height={32} priority className="rounded-sm" />
          <span className="text-lg font-semibold tracking-tight text-brand-purple-700">ABIES</span>
        </Link>
        <span className="text-xs font-medium text-brand-neutral-400">Ayurveda Care Platform</span>
      </div>
    </header>
  );
}
