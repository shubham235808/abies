import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { publicDoctorSearchSchema } from '@/modules/doctors/doctors.schemas';
import { searchPublic } from '@/modules/doctors/doctors.service';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = publicDoctorSearchSchema.parse(Object.fromEntries(url.searchParams));
    const result = await searchPublic(query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
