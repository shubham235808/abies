import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { publicTestSearchSchema } from '@abies/domain/modules/diagnostics/catalogue.schemas';
import { searchPackagesPublic } from '@abies/domain/modules/diagnostics/catalogue.service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = publicTestSearchSchema.parse(Object.fromEntries(searchParams));
    const result = await searchPackagesPublic(query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
