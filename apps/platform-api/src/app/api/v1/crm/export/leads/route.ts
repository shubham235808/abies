import { NextResponse } from 'next/server';
import { errorResponse, UnauthorizedError } from '@abies/domain/lib/errors';
import { callDbService, sessionTokenFromCookies } from '@abies/domain/server/db-service';

// Returns the CSV as a file. The database service builds it and returns JSON,
// so the browser never talks to the database service directly.
export async function GET(req: Request) {
  try {
    const token = await sessionTokenFromCookies();
    if (!token) throw new UnauthorizedError();
    const search = new URL(req.url).search;
    const res = await callDbService<{ filename: string; csv: string }>(`/db/v1/crm/export/leads${search}`, {
      sessionToken: token,
      requestId: req.headers.get('x-request-id') ?? undefined,
    });
    if (res.status !== 200) return NextResponse.json(res.body, { status: res.status });
    return new NextResponse(res.body.csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${res.body.filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, req);
  }
}
