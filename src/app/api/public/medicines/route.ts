import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { publicMedicineSearchSchema } from '@/modules/medicines/catalogue.schemas';
import { searchPublic } from '@/modules/medicines/catalogue.service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = publicMedicineSearchSchema.parse(Object.fromEntries(searchParams));
    const result = await searchPublic(query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
