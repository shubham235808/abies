import { NextResponse } from 'next/server';
import { errorResponse, ForbiddenError } from '@abies/domain/lib/errors';
import { processDueNotifications } from '@abies/domain/modules/notifications/notifications.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

// Runs the retry worker once. Administrators only; a scheduled job calls it later.
export async function POST(req: Request) {
  try {
    await verifyCallerToken(req);
    const session = await sessionFromRequest(req);
    if (session.user.role !== 'ADMIN' || !session.mfaVerified) {
      throw new ForbiddenError('Only administrators with MFA can run the notification worker');
    }
    return NextResponse.json(await processDueNotifications());
  } catch (error) {
    return errorResponse(error, req);
  }
}
