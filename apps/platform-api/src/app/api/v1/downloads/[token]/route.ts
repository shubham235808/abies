import { errorResponse } from '@abies/domain/lib/errors';
import { verifyDownloadToken } from '@abies/domain/lib/download-token';
import { objectResponse } from '@abies/domain/lib/storage';

// One generic, token-authenticated file route for every "the client fetches
// this with no session attached" download (lib/download-token.ts's own
// comment explains why that's sometimes the real requirement, not a
// shortcut). The token itself — verified here, not a session cookie — is
// what authorizes this specific request; every caller that issues one has
// already done its own ownership/role/status check before calling
// createDownloadToken.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const storageKey = verifyDownloadToken(token);
    return await objectResponse(storageKey, { cacheControl: 'private, max-age=0, no-store' });
  } catch (error) {
    return errorResponse(error, req);
  }
}
