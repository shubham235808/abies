import { NextResponse } from 'next/server';
import { errorResponse, UnauthorizedError } from '@abies/domain/lib/errors';
import { assertSameOrigin } from '@abies/domain/server/origin';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';

async function forward(req: Request, dbPath: string, method: string, withBody: boolean) {
  if (method !== 'GET') {
    assertSameOrigin(req);
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
    const search = new URL(req.url).search;
    return await forward(req, `/db/v1/crm/opportunities${search}`, 'GET', false);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    return await forward(req, '/db/v1/crm/opportunities', 'POST', true);
  } catch (error) {
    return errorResponse(error, req);
  }
}
