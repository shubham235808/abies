import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { objectResponse } from '@abies/domain/lib/storage';
import { publicPromotionImage } from '@abies/domain/modules/promotions/promotions.service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const variant = new URL(req.url).searchParams.get('variant');
    if (variant !== 'desktop' && variant !== 'mobile') {
      return NextResponse.json({ error: 'variant must be desktop or mobile' }, { status: 400 });
    }
    const { storageKey } = await publicPromotionImage(id, variant);
    return await objectResponse(storageKey, { cacheControl: 'public, max-age=3600' });
  } catch (error) {
    return errorResponse(error, req);
  }
}
