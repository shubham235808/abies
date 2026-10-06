import { NextResponse } from 'next/server';
import { errorResponse, ForbiddenError, UnauthorizedError } from '@abies/domain/lib/errors';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';

async function forward(req: Request, dbPath: string, method: string, withBody: boolean) {
  if (method !== 'GET') {
    const expected = new URL(process.env.APP_BASE_URL ?? 'https://dev.abies.in').origin;
    if (req.headers.get('origin') !== expected) throw new ForbiddenError('Cross-site request blocked');
  }
  const token = await sessionTokenFromCookies();
  if (!token) throw new UnauthorizedError();
  const body = withBody ? await req.json() : undefined;
  const res = await callDbService(dbPath, {
    method,
    body,
    sessionToken: token,
    requestId: req.headers.get('x-request-id') ?? undefined,
  });
  return NextResponse.json(res.body, { status: res.status });
}

export async function GET(req: Request) {
  try {
    return await forward(req, '/db/v1/crm/dashboard', 'GET', false);
  } catch (error) {
    return errorResponse(error, req);
  }
}
