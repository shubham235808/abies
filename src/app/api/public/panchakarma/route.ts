import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { publicTherapySearchSchema } from '@/modules/panchakarma/catalogue.schemas';
import { searchPublic } from '@/modules/panchakarma/catalogue.service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = publicTherapySearchSchema.parse(Object.fromEntries(searchParams));
    const result = await searchPublic(query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
