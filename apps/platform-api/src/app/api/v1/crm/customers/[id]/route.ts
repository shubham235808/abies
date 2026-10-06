import { NextResponse } from 'next/server';
import { errorResponse, UnauthorizedError } from '@abies/domain/lib/errors';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';

// Proxy to the database service. Reads only, so no origin check is needed.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await sessionTokenFromCookies();
    if (!token) throw new UnauthorizedError();
    const { id } = await params;
    const res = await callDbService(`/db/v1/crm/customers/${encodeURIComponent(id)}`, {
      sessionToken: token,
      requestId: req.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.json(res.body, { status: res.status });
  } catch (error) {
    return errorResponse(error, req);
  }
}
