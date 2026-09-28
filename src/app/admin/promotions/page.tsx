import { listPromotions } from '@/modules/promotions/promotions.service';
import { PromotionsManager } from './promotions-manager';

export default async function AdminPromotionsPage() {
  const promotions = await listPromotions();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Promotion Manager</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Banners shown on the public site and the patient dashboard. A placement with no active, in-window promotion
        simply shows nothing — never a placeholder graphic.
      </p>

      <PromotionsManager
        initial={promotions.map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: p.subtitle,
          description: p.description,
          ctaLabel: p.ctaLabel,
          ctaHref: p.ctaHref,
          placement: p.placement,
          entityType: p.entityType,
          entityId: p.entityId,
          startAt: p.startAt.toISOString(),
          endAt: p.endAt.toISOString(),
          priority: p.priority,
          active: p.active,
          targetLocations: p.targetLocations,
          targetLanguages: p.targetLanguages,
          impressions: p.impressions,
          clicks: p.clicks,
        }))}
      />
    </div>
  );
}
