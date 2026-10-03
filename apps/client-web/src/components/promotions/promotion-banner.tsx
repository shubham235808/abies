import Image from 'next/image';
import Link from 'next/link';
import type { ServedPromotion } from '@abies/domain/modules/promotions/promotions.service';

// Renders the highest-priority active promotion for a placement, or
// nothing at all — per docs/PORTAL-UX-SPEC.md's "no active promotion in a
// placement -> the placement simply doesn't render" rule (never a
// placeholder graphic). Callers pass the already-filtered result of
// activePromotionsForPlacement(); this component owns only presentation.
export function PromotionBanner({ promotion }: { promotion: ServedPromotion | null }) {
  if (!promotion) return null;

  const content = (
    <div className="group relative overflow-hidden rounded-card border border-brand-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[21/9] w-full sm:aspect-[3/1]">
        <Image src={promotion.desktopImageUrl} alt={promotion.title} fill className="object-cover" unoptimized />
      </div>
      <div className="p-4 sm:p-5">
        <p className="font-semibold text-brand-neutral-900">{promotion.title}</p>
        {promotion.subtitle && <p className="mt-1 text-sm text-brand-neutral-600">{promotion.subtitle}</p>}
        {promotion.ctaLabel && (
          <span className="mt-3 inline-block text-sm font-medium text-brand-purple-700 underline decoration-brand-purple-200 underline-offset-2 group-hover:decoration-brand-purple-600">
            {promotion.ctaLabel} →
          </span>
        )}
      </div>
    </div>
  );

  return promotion.ctaHref ? (
    <Link href={promotion.ctaHref} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
