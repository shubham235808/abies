import Image from 'next/image';
import type { ServedTestimonial } from '@abies/domain/modules/content/testimonials.service';

// Renders nothing at all when there are no active testimonials — same
// "no content -> no placeholder" rule PromotionBanner already applies.
export function TestimonialsSection({ testimonials }: { testimonials: ServedTestimonial[] }) {
  if (testimonials.length === 0) return null;

  return (
    <section>
      <h2 className="text-[clamp(30px,4vw,44px)] font-extrabold tracking-tight text-brand-neutral-900">What patients say</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((t) => (
          <div key={t.id} className="flex flex-col rounded-card border border-brand-neutral-200 bg-white p-5">
            {t.rating && (
              <p aria-label={`${t.rating} out of 5`} className="text-sm text-brand-orange-500">
                {'★'.repeat(t.rating)}
                {'☆'.repeat(5 - t.rating)}
              </p>
            )}
            <p className="mt-2 flex-1 text-sm text-brand-neutral-600">&ldquo;{t.quote}&rdquo;</p>
            <div className="mt-4 flex items-center gap-3">
              {t.photoUrl ? (
                <Image src={t.photoUrl} alt={t.authorName} width={40} height={40} className="h-10 w-10 rounded-full object-cover" unoptimized />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-purple-50 text-sm font-bold text-brand-purple-700">
                  {t.authorName.charAt(0).toUpperCase()}
                </span>
              )}
              <div>
                <p className="text-sm font-bold text-brand-neutral-900">{t.authorName}</p>
                {t.authorRole && <p className="text-xs text-brand-neutral-500">{t.authorRole}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
